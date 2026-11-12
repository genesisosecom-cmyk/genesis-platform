-- =====================================================================
-- Reparto por segmento: cada SDR recibe todos los leads, solo los calificados
-- (100 USD/día o más en Meta) o solo los no calificados.
-- Si para un lead no hay ninguna SDR activa de su segmento, se reparte entre todas las
-- activas, para que ningún lead quede sin asignar. Dentro del segmento sigue la ronda por peso.
-- =====================================================================

alter table public.sales_reps
  add column sdr_segment text not null default 'todos'
  check (sdr_segment in ('todos', 'calificados', 'no_calificados'));
comment on column public.sales_reps.sdr_segment is
  'Qué leads recibe en el reparto automático: todos, solo calificados o solo no calificados.';

create or replace function private.assign_sdr(p_lead uuid, p_launch text, p_motivo text)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_current uuid;
  v_cal boolean;
  v_ids uuid[];
  v_total int;
  v_rep public.sales_reps;
begin
  select sdr_id into v_current from public.leads where id = p_lead for update;
  if v_current is not null then
    return v_current;
  end if;

  -- ¿El lead califica en este lanzamiento? (sin dato = no califica)
  select coalesce(ll.califica, false) into v_cal
  from public.lead_launches ll where ll.lead_id = p_lead and ll.launch_id = p_launch;
  v_cal := coalesce(v_cal, false);

  perform 1 from public.sales_reps where sdr_status = 'activo' order by id for update;

  -- SDR activas de su segmento; si no hay ninguna, todas las activas.
  select array_agg(id) into v_ids from public.sales_reps
  where sdr_status = 'activo'
    and (sdr_segment = 'todos' or (sdr_segment = 'calificados') = v_cal);
  if v_ids is null then
    select array_agg(id) into v_ids from public.sales_reps where sdr_status = 'activo';
  end if;
  if v_ids is null then
    return null; -- sin SDR activos: el lead queda sin asignar
  end if;

  select coalesce(sum(sdr_weight), 0) into v_total from public.sales_reps where id = any (v_ids);
  update public.sales_reps set rr_credit = rr_credit + sdr_weight where id = any (v_ids);
  select * into v_rep from public.sales_reps where id = any (v_ids) order by rr_credit desc, created_at, id limit 1;
  update public.sales_reps set rr_credit = rr_credit - v_total where id = v_rep.id;

  update public.leads set sdr_id = v_rep.id, updated_at = now() where id = p_lead;
  insert into public.lead_events (lead_id, launch_id, kind, summary, data)
  values (p_lead, p_launch, 'sdr', 'Asignado a ' || v_rep.name || ' (' || p_motivo || ')', jsonb_build_object('sdr_id', v_rep.id));
  return v_rep.id;
end;
$function$;
