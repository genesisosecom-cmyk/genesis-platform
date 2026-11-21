-- =====================================================================
-- Paso 11 · Rituales: tareas recurrentes.
-- tasks.recurrence = 'semanal:<día>' (lun, mar, mie, jue, vie, sab, dom).
-- Al pasar a «Hecha» una tarea recurrente, se crea sola la de la semana
-- siguiente (mismo título, fase, responsable y notas).
-- =====================================================================

alter table public.tasks add column recurrence text
  check (recurrence ~ '^semanal:(lun|mar|mie|jue|vie|sab|dom)$');

create function private.task_spawn_next()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text;
  v_id text;
  v_dow int := array_position(array['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'], split_part(new.recurrence, ':', 2)) - 1;
  v_from date := greatest(coalesce(new.due_date, current_date), (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_due date;
begin
  -- Si ya hay una abierta igual (la reabrieron y la volvieron a cerrar), no se duplica.
  if exists (select 1 from public.tasks t where t.id <> new.id and t.title = new.title and t.phase = new.phase
             and t.recurrence = new.recurrence and t.status <> 'Hecha') then
    return new;
  end if;
  -- Próximo día de la semana pedido, después de la fecha de la tarea que se cierra (o de hoy).
  v_due := v_from + ((v_dow - extract(dow from v_from)::int + 6) % 7 + 1);
  select prefix into v_prefix from public.task_phases where name = new.phase;
  perform pg_advisory_xact_lock(hashtext('task-id:' || v_prefix));
  select v_prefix || '-' || lpad((coalesce(max(substring(id from '[0-9]+$')::int), 0) + 1)::text, 2, '0')
  into v_id from public.tasks where id like v_prefix || '-%';

  insert into public.tasks (id, title, phase, funnel_id, launch_id, quantity, status, responsible_id, responsible_name, due_date,
                            agent, reference, link, notes, recurrence, created_by_name, updated_by_name)
  values (v_id, new.title, new.phase, new.funnel_id, coalesce(private.current_launch(new.funnel_id), new.launch_id), new.quantity, 'Por hacer',
          new.responsible_id, new.responsible_name, v_due, new.agent, new.reference, '', new.notes, new.recurrence, 'Sistema', 'Sistema');
  insert into public.task_events (task_id, author_name, what)
  values (v_id, 'Sistema', 'Creó la tarea (repetición semanal de ' || new.id || ')');
  return new;
end;
$$;
revoke execute on function private.task_spawn_next() from public, anon, authenticated;

create trigger tasks_recurrence after update of status on public.tasks
  for each row when (new.status = 'Hecha' and old.status is distinct from 'Hecha' and new.recurrence is not null)
  execute function private.task_spawn_next();

-- Marcar (o quitar) la repetición de una tarea.
create function public.task_set_recurrence(p_id text, p_recurrence text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v text := nullif(trim(coalesce(p_recurrence, '')), '');
  a record;
begin
  perform private.task_require_admin();
  if v is not null and v !~ '^semanal:(lun|mar|mie|jue|vie|sab|dom)$' then raise exception 'Repetición inválida: %', v; end if;
  select * into a from private.task_actor();
  update public.tasks set recurrence = v, version = version + 1, updated_at = now(), updated_by = a.actor_id, updated_by_name = coalesce(a.actor_name, '')
  where id = p_id and recurrence is distinct from v;
  if found then
    perform private.task_log(p_id, case when v is null then 'Quitó la repetición' else 'Repetición: todos los ' ||
      (array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'])[array_position(array['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'], split_part(v, ':', 2))] end, 'recurrence');
  elsif not exists (select 1 from public.tasks where id = p_id) then
    raise exception 'La tarea % ya no existe', p_id;
  end if;
end;
$$;
revoke execute on function public.task_set_recurrence(text, text) from public, anon;
grant execute on function public.task_set_recurrence(text, text) to authenticated;

-- Los rituales del plan evergreen: martes (lectura y ajustes), sábado (dolor de la semana
-- siguiente) y viernes (testeo de ángulos). La lectura a 48 h y 7 días de cada pieza se sigue
-- desde el módulo Contenido (lecturas pendientes).
update public.tasks set recurrence = 'semanal:mar' where id = 'EV1-07' and funnel_id = 'evergreen-organico' and recurrence is null;
update public.tasks set recurrence = 'semanal:sab' where id = 'EV1-10' and funnel_id = 'evergreen-organico' and recurrence is null;
update public.tasks set recurrence = 'semanal:vie' where id = 'EV2-08' and funnel_id = 'evergreen-organico' and recurrence is null;
