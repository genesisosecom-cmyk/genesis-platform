-- =====================================================================
-- Paso 2 · Tareas por funnel.
-- task_phases y tasks ganan funnel_id (y tasks, launch_id). Las tareas y
-- fases de hoy quedan en `webinar`. El funnel de una tarea es siempre el
-- de su fase.
-- =====================================================================

alter table public.task_phases add column funnel_id text references public.funnels (id) on update cascade;
update public.task_phases set funnel_id = 'webinar';
alter table public.task_phases alter column funnel_id set not null;
create index task_phases_funnel_idx on public.task_phases (funnel_id, sort);

alter table public.tasks add column funnel_id text references public.funnels (id) on update cascade;
update public.tasks set funnel_id = 'webinar';
alter table public.tasks alter column funnel_id set not null;
alter table public.tasks add column launch_id text references public.launches (id) on update cascade on delete set null;
update public.tasks set launch_id = 'clase-17-11' where exists (select 1 from public.launches where id = 'clase-17-11');
create index tasks_funnel_idx on public.tasks (funnel_id);

-- Fecha límite por defecto: fecha del ciclo actual del funnel de la fase + días de la fase.
create or replace function private.task_default_due(p_phase text)
returns date language sql stable security definer set search_path = '' as $$
  select ((select l.starts_at from public.launches l where l.is_current and l.funnel_id = ph.funnel_id limit 1)
            at time zone 'America/Argentina/Buenos_Aires')::date + ph.offset_days
  from public.task_phases ph where ph.name = p_phase;
$$;

-- Crear: acepta funnel_id y launch_id. Si no vienen, el funnel es el de la fase y el ciclo,
-- el actual de ese funnel.
create or replace function public.task_create(p jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_phase public.task_phases;
  v_id text;
  v_resp text := trim(coalesce(p ->> 'responsible_name', ''));
  v_due date;
  v_funnel text := nullif(p ->> 'funnel_id', '');
  v_launch text := nullif(p ->> 'launch_id', '');
  a record;
begin
  perform private.task_require_admin();
  select * into v_phase from public.task_phases where name = p ->> 'phase';
  if v_phase.name is null then raise exception 'Elegí una fase válida'; end if;
  if v_funnel is not null and v_funnel <> v_phase.funnel_id then
    raise exception 'La fase «%» no es del funnel %', v_phase.name, v_funnel;
  end if;
  v_funnel := v_phase.funnel_id;
  if v_launch is null then
    v_launch := private.current_launch(v_funnel);
  elsif not exists (select 1 from public.launches where id = v_launch and funnel_id = v_funnel) then
    raise exception 'El ciclo % no es del funnel %', v_launch, v_funnel;
  end if;
  if trim(coalesce(p ->> 'title', '')) = '' then raise exception 'Falta el título'; end if;
  if v_resp <> '' and not exists (select 1 from public.task_people where name = v_resp and active) then
    raise exception 'Responsable desconocido: %', v_resp;
  end if;
  v_due := case when p ? 'due_date' then nullif(p ->> 'due_date', '')::date else private.task_default_due(v_phase.name) end;

  perform pg_advisory_xact_lock(hashtext('task-id:' || v_phase.prefix));
  select v_phase.prefix || '-' || lpad((coalesce(max(substring(id from '[0-9]+$')::int), 0) + 1)::text, 2, '0')
  into v_id from public.tasks where id like v_phase.prefix || '-%';

  select * into a from private.task_actor();
  insert into public.tasks (id, title, phase, funnel_id, launch_id, quantity, status, responsible_id, responsible_name, due_date,
                            agent, reference, link, notes, created_by, created_by_name, updated_by, updated_by_name)
  values (v_id, trim(p ->> 'title'), v_phase.name, v_funnel, v_launch, coalesce((p ->> 'quantity')::int, 1), coalesce(nullif(p ->> 'status', ''), 'Por hacer'),
          private.task_person(v_resp), v_resp, v_due,
          coalesce(p ->> 'agent', ''), coalesce(p ->> 'reference', ''), coalesce(p ->> 'link', ''), coalesce(p ->> 'notes', ''),
          a.actor_id, coalesce(a.actor_name, ''), a.actor_id, coalesce(a.actor_name, ''));
  perform private.task_log(v_id, 'Creó la tarea');
  return v_id;
end;
$$;

-- Editar: además de los campos de siempre acepta funnel_id y launch_id. Cambiar la fase a una de
-- otro funnel mueve la tarea a ese funnel (y a su ciclo actual).
create or replace function public.task_update(p_id text, p_changes jsonb, p_expected jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks;
  cur jsonb;
  k text;
  newv jsonb;
  oldv jsonb;
  conflicts jsonb := '[]'::jsonb;
  applied int := 0;
  last_ev public.task_events;
  a record;
  v_funnel text;
  lbl jsonb := '{"title": "el título", "agent": "el agente", "reference": "la referencia", "link": "el link", "notes": "las notas"}';
begin
  perform private.task_require_admin();
  select * into t from public.tasks where id = p_id for update;
  if t.id is null then raise exception 'La tarea % ya no existe (¿la borraron?)', p_id; end if;
  cur := to_jsonb(t);
  select * into a from private.task_actor();

  -- La fase va primero: define el funnel contra el que se validan funnel_id y launch_id.
  for k in select x from jsonb_object_keys(p_changes) x order by (x <> 'phase'), (x <> 'funnel_id'), x loop
    if k not in ('title', 'phase', 'funnel_id', 'launch_id', 'quantity', 'status', 'responsible_name', 'due_date', 'agent', 'reference', 'link', 'notes') then
      raise exception 'Campo no editable: %', k;
    end if;
    newv := p_changes -> k;
    oldv := cur -> k;
    if k in ('due_date', 'launch_id') and newv = to_jsonb(''::text) then newv := 'null'::jsonb; end if;
    if k in ('funnel_id', 'launch_id') then
      select to_jsonb(x) -> k into oldv from public.tasks x where x.id = p_id; -- la fase pudo haberlos cambiado recién
    end if;
    if newv = oldv then continue; end if;
    -- ¿Lo cambió otro desde que se abrió la ficha?
    if p_expected ? k and (p_expected -> k) is distinct from (cur -> k)
       and not (k in ('due_date', 'launch_id') and p_expected -> k = to_jsonb(''::text) and (cur -> k) = 'null'::jsonb) then
      select * into last_ev from public.task_events where task_id = p_id and field = k order by created_at desc limit 1;
      conflicts := conflicts || jsonb_build_object('field', k, 'current', cur -> k, 'by', last_ev.author_name, 'at', last_ev.created_at);
      continue;
    end if;

    case k
      when 'title' then
        if trim(newv #>> '{}') = '' then raise exception 'El título no puede quedar vacío'; end if;
        update public.tasks set title = trim(newv #>> '{}') where id = p_id;
      when 'phase' then
        select funnel_id into v_funnel from public.task_phases where name = newv #>> '{}';
        if v_funnel is null then raise exception 'Fase inválida'; end if;
        update public.tasks set phase = newv #>> '{}', funnel_id = v_funnel,
          launch_id = case when funnel_id = v_funnel then launch_id else private.current_launch(v_funnel) end
        where id = p_id;
        perform private.task_log(p_id, 'Fase: ' || (oldv #>> '{}') || ' → ' || (newv #>> '{}'), k);
      when 'funnel_id' then
        -- El funnel sale de la fase: acá solo se confirma que coincide.
        raise exception 'La fase de la tarea no es del funnel %: cambiá la fase', newv #>> '{}';
      when 'launch_id' then
        if newv <> 'null'::jsonb and not exists (
          select 1 from public.launches l join public.tasks x on x.funnel_id = l.funnel_id where l.id = newv #>> '{}' and x.id = p_id
        ) then raise exception 'Ese ciclo no es del funnel de la tarea'; end if;
        update public.tasks set launch_id = newv #>> '{}' where id = p_id;
        perform private.task_log(p_id, 'Ciclo: ' || coalesce(oldv #>> '{}', 'sin ciclo') || ' → ' || coalesce(newv #>> '{}', 'sin ciclo'), k);
      when 'quantity' then
        update public.tasks set quantity = (newv #>> '{}')::int where id = p_id;
        perform private.task_log(p_id, 'Cantidad: ' || (oldv #>> '{}') || ' → ' || (newv #>> '{}'), k);
      when 'status' then
        update public.tasks set status = newv #>> '{}' where id = p_id;
        perform private.task_log(p_id, 'Estado: ' || (oldv #>> '{}') || ' → ' || (newv #>> '{}'), k);
      when 'responsible_name' then
        if coalesce(newv #>> '{}', '') <> '' and not exists (select 1 from public.task_people where name = newv #>> '{}' and active) then
          raise exception 'Responsable desconocido: %', newv #>> '{}';
        end if;
        update public.tasks set responsible_name = coalesce(newv #>> '{}', ''), responsible_id = private.task_person(newv #>> '{}') where id = p_id;
        perform private.task_log(p_id, case when coalesce(newv #>> '{}', '') = '' then 'Quitó el responsable' else 'Asignó a ' || (newv #>> '{}') end, k);
      when 'due_date' then
        update public.tasks set due_date = (newv #>> '{}')::date where id = p_id;
        perform private.task_log(p_id, 'Fecha límite: ' || coalesce(to_char((oldv #>> '{}')::date, 'DD/MM'), 'sin fecha') || ' → '
          || coalesce(to_char((newv #>> '{}')::date, 'DD/MM'), 'sin fecha'), k);
      else
        execute format('update public.tasks set %I = $1 where id = $2', k) using coalesce(newv #>> '{}', ''), p_id;
    end case;
    if k in ('title', 'agent', 'reference', 'link', 'notes') then
      perform private.task_log(p_id, 'Editó ' || (lbl ->> k), k);
    end if;
    applied := applied + 1;
  end loop;

  if applied > 0 then
    update public.tasks set version = version + 1, updated_at = now(), updated_by = a.actor_id, updated_by_name = coalesce(a.actor_name, '')
    where id = p_id;
  end if;
  return jsonb_build_object('ok', jsonb_array_length(conflicts) = 0, 'applied', applied, 'conflicts', conflicts,
    'task', (select to_jsonb(x) from public.tasks x where x.id = p_id));
end;
$$;
