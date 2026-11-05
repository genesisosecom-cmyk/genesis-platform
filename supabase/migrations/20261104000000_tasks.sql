-- =====================================================================
-- Tareas del equipo (migradas del tracker de ventas): tablero por estado,
-- lista por fase, comentarios e historial. Solo superadmin.
-- Todo cambio pasa por las funciones task_*, que validan, escriben el
-- historial con quién y cuándo, y no pisan ediciones simultáneas.
-- =====================================================================

-- ---------- Personas que pueden ser responsables (y alias del historial) ----------
create table public.task_people (
  name text primary key,                              -- nombre corto: Mati, Santi, Manu, José
  profile_id uuid unique references public.profiles (id) on delete set null,
  aliases text[] not null default '{}',               -- cómo aparece en el historial del tracker
  sort int not null default 0,
  active boolean not null default true
);

insert into public.task_people (name, profile_id, aliases, sort)
select v.name, (select id from public.profiles where lower(email) = v.email), v.aliases, v.sort
from (values
  ('Mati', 'matiiaschao2@gmail.com', array['Mati', 'Matías', 'Matias'], 1),
  ('Santi', 'santiagozurbrigkwork@gmail.com', array['Santi', 'Santiago'], 2),
  ('Manu', 'manudominguezsala@gmail.com', array['Manu', 'Manuel'], 3),
  ('José', 'josezelaya004@gmail.com', array['José', 'Jose'], 4)
) as v (name, email, aliases, sort);

-- ---------- Fases (prefijo del código y días respecto del webinar) ----------
create table public.task_phases (
  name text primary key,
  prefix text not null unique check (prefix ~ '^[A-Z0-9]+$'),
  offset_days int,                                     -- null = sin fecha límite por defecto
  sort int not null default 0
);

insert into public.task_phases (name, prefix, offset_days, sort) values
  ('Adquisición', 'ADQ', -10, 1),
  ('Nutrición', 'NUT', -6, 2),
  ('Webinar', 'WEB', -1, 3),
  ('Post-webinar', 'POST', 0, 4),
  ('B:52', 'B52', 0, 5),
  ('Bonus', 'BON', -3, 6),
  ('Sistemas', 'SIS', -10, 7),
  ('Equipo', 'EQ', null, 8),
  ('Extras', 'EXT', null, 9);

-- ---------- Tareas ----------
create table public.tasks (
  id text primary key check (id ~ '^[A-Z0-9]+-[0-9]+$'), -- código visible, ej. ADQ-03
  title text not null check (char_length(title) between 1 and 200),
  phase text not null references public.task_phases (name) on update cascade,
  quantity int not null default 1 check (quantity between 1 and 999),
  status text not null default 'Por hacer' check (status in ('Por hacer', 'En curso', 'En revisión', 'Hecha', 'Bloqueada')),
  responsible_id uuid references public.profiles (id) on delete set null,
  responsible_name text not null default '',            -- nombre corto (Mati, Santi…) o '' sin asignar
  due_date date,
  agent text not null default '' check (char_length(agent) <= 300),
  reference text not null default '' check (char_length(reference) <= 600),
  link text not null default '' check (char_length(link) <= 500),
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_by_name text not null default '',
  updated_at timestamptz not null default now(),
  version int not null default 1                        -- sube con cada cambio
);
create index tasks_phase_idx on public.tasks (phase);
create index tasks_status_idx on public.tasks (status);
create index tasks_responsible_idx on public.tasks (responsible_id);
create index tasks_due_idx on public.tasks (due_date);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references public.tasks (id) on delete cascade on update cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null default '',                 -- tal cual (ej. "Santiago")
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

-- Historial: una fila por cambio (no se reescribe nada al agregar).
create table public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references public.tasks (id) on delete cascade on update cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null default '',
  what text not null,
  field text,                                           -- campo que cambió (para avisar de conflictos)
  created_at timestamptz not null default now()
);
create index task_events_task_idx on public.task_events (task_id, created_at);

-- ---------- RLS: solo superadmin ----------
alter table public.task_people enable row level security;
alter table public.task_phases enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_events enable row level security;

create policy "task_people: solo admin" on public.task_people
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "task_phases: solo admin" on public.task_phases
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
-- Tareas, comentarios e historial: se leen directo; se escriben solo con las funciones task_*.
create policy "tasks: admin lee" on public.tasks
  for select to authenticated using ((select private.is_superadmin()));
create policy "task_comments: admin lee" on public.task_comments
  for select to authenticated using ((select private.is_superadmin()));
create policy "task_events: admin lee" on public.task_events
  for select to authenticated using ((select private.is_superadmin()));

-- =====================================================================
-- Funciones
-- =====================================================================

-- Quién hace el cambio: su nombre corto si está en task_people; si no, su nombre o email.
create function private.task_actor(out actor_id uuid, out actor_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce((select name from public.task_people where profile_id = p.id), nullif(p.full_name, ''), p.email)
  from public.profiles p where p.id = (select auth.uid());
$$;

-- Perfil de un nombre del historial ("Santiago" → Santi) o de un responsable.
create function private.task_person(p_name text)
returns uuid language sql stable security definer set search_path = '' as $$
  select profile_id from public.task_people
  where name = trim(p_name) or trim(p_name) = any (aliases)
  limit 1;
$$;

create function private.task_require_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(private.is_superadmin(), false) then raise exception 'Solo el equipo admin puede editar tareas'; end if;
end;
$$;

-- Fecha límite por defecto: fecha del lanzamiento actual (el webinar) + días de la fase.
create function private.task_default_due(p_phase text)
returns date language sql stable security definer set search_path = '' as $$
  select ((select starts_at from public.launches where is_current limit 1) at time zone 'America/Argentina/Buenos_Aires')::date
         + (select offset_days from public.task_phases where name = p_phase);
$$;

create function private.task_log(p_task text, p_what text, p_field text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.task_events (task_id, author_id, author_name, what, field)
  select p_task, a.actor_id, coalesce(a.actor_name, 'Sistema'), p_what, p_field from private.task_actor() a;
$$;

-- Crear: el código es el siguiente de la fase (ADQ-15, NUT-08…), sin choques entre dos que crean a la vez.
create function public.task_create(p jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_phase public.task_phases;
  v_id text;
  v_resp text := trim(coalesce(p ->> 'responsible_name', ''));
  v_due date;
  a record;
begin
  perform private.task_require_admin();
  select * into v_phase from public.task_phases where name = p ->> 'phase';
  if v_phase.name is null then raise exception 'Elegí una fase válida'; end if;
  if trim(coalesce(p ->> 'title', '')) = '' then raise exception 'Falta el título'; end if;
  if v_resp <> '' and not exists (select 1 from public.task_people where name = v_resp and active) then
    raise exception 'Responsable desconocido: %', v_resp;
  end if;
  v_due := case when p ? 'due_date' then nullif(p ->> 'due_date', '')::date else private.task_default_due(v_phase.name) end;

  perform pg_advisory_xact_lock(hashtext('task-id:' || v_phase.prefix));
  select v_phase.prefix || '-' || lpad((coalesce(max(substring(id from '[0-9]+$')::int), 0) + 1)::text, 2, '0')
  into v_id from public.tasks where id like v_phase.prefix || '-%';

  select * into a from private.task_actor();
  insert into public.tasks (id, title, phase, quantity, status, responsible_id, responsible_name, due_date,
                            agent, reference, link, notes, created_by, created_by_name, updated_by, updated_by_name)
  values (v_id, trim(p ->> 'title'), v_phase.name, coalesce((p ->> 'quantity')::int, 1), coalesce(nullif(p ->> 'status', ''), 'Por hacer'),
          private.task_person(v_resp), v_resp, v_due,
          coalesce(p ->> 'agent', ''), coalesce(p ->> 'reference', ''), coalesce(p ->> 'link', ''), coalesce(p ->> 'notes', ''),
          a.actor_id, coalesce(a.actor_name, ''), a.actor_id, coalesce(a.actor_name, ''));
  perform private.task_log(v_id, 'Creó la tarea');
  return v_id;
end;
$$;

-- Editar campos sin pisar a otros: p_changes trae solo lo que se cambió y p_expected el valor que
-- había cuando se abrió la ficha. Si alguien cambió ese mismo campo mientras tanto, no se aplica y se
-- devuelve en "conflicts" con el valor actual, quién y cuándo. Los demás campos se guardan igual.
create function public.task_update(p_id text, p_changes jsonb, p_expected jsonb)
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
  lbl jsonb := '{"title": "el título", "agent": "el agente", "reference": "la referencia", "link": "el link", "notes": "las notas"}';
begin
  perform private.task_require_admin();
  select * into t from public.tasks where id = p_id for update;
  if t.id is null then raise exception 'La tarea % ya no existe (¿la borraron?)', p_id; end if;
  cur := to_jsonb(t);
  select * into a from private.task_actor();

  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('title', 'phase', 'quantity', 'status', 'responsible_name', 'due_date', 'agent', 'reference', 'link', 'notes') then
      raise exception 'Campo no editable: %', k;
    end if;
    newv := p_changes -> k;
    oldv := cur -> k;
    if k = 'due_date' and newv = to_jsonb(''::text) then newv := 'null'::jsonb; end if;
    if newv = oldv then continue; end if;
    -- ¿Lo cambió otro desde que se abrió la ficha?
    if p_expected ? k and (p_expected -> k) is distinct from oldv
       and not (k = 'due_date' and p_expected -> k = to_jsonb(''::text) and oldv = 'null'::jsonb) then
      select * into last_ev from public.task_events where task_id = p_id and field = k order by created_at desc limit 1;
      conflicts := conflicts || jsonb_build_object('field', k, 'current', oldv, 'by', last_ev.author_name, 'at', last_ev.created_at);
      continue;
    end if;

    case k
      when 'title' then
        if trim(newv #>> '{}') = '' then raise exception 'El título no puede quedar vacío'; end if;
        update public.tasks set title = trim(newv #>> '{}') where id = p_id;
      when 'phase' then
        if not exists (select 1 from public.task_phases where name = newv #>> '{}') then raise exception 'Fase inválida'; end if;
        update public.tasks set phase = newv #>> '{}' where id = p_id;
        perform private.task_log(p_id, 'Fase: ' || (oldv #>> '{}') || ' → ' || (newv #>> '{}'), k);
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

create function public.task_comment(p_id text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a record;
begin
  perform private.task_require_admin();
  if trim(coalesce(p_body, '')) = '' then raise exception 'El comentario está vacío'; end if;
  if not exists (select 1 from public.tasks where id = p_id) then raise exception 'La tarea % ya no existe', p_id; end if;
  select * into a from private.task_actor();
  insert into public.task_comments (task_id, author_id, author_name, body) values (p_id, a.actor_id, coalesce(a.actor_name, ''), trim(p_body));
  update public.tasks set updated_at = now(), updated_by = a.actor_id, updated_by_name = coalesce(a.actor_name, '') where id = p_id;
end;
$$;

create function public.task_delete(p_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.task_require_admin();
  delete from public.tasks where id = p_id;
  if not found then raise exception 'La tarea % ya no existe', p_id; end if;
end;
$$;

revoke execute on function public.task_create(jsonb) from public, anon;
revoke execute on function public.task_update(text, jsonb, jsonb) from public, anon;
revoke execute on function public.task_comment(text, text) from public, anon;
revoke execute on function public.task_delete(text) from public, anon;
grant execute on function public.task_create(jsonb) to authenticated;
grant execute on function public.task_update(text, jsonb, jsonb) to authenticated;
grant execute on function public.task_comment(text, text) to authenticated;
grant execute on function public.task_delete(text) to authenticated;
revoke execute on function private.task_actor() from public, anon, authenticated;
revoke execute on function private.task_person(text) from public, anon, authenticated;
revoke execute on function private.task_require_admin() from public, anon, authenticated;
revoke execute on function private.task_default_due(text) from public, anon, authenticated;
revoke execute on function private.task_log(text, text, text) from public, anon, authenticated;

-- ---------- Tiempo real: el tablero se actualiza cuando otro cambia algo (respeta RLS) ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tasks, public.task_comments, public.task_events;
  end if;
end $$;
