-- =====================================================================
-- crm_team_metrics: suma lo que mostraban las tablas «Por SDR» y «Por closer» de Métricas,
-- que se sacan de la pantalla:
--   por SDR: califican_por_inversion (califica = true), aplicaron, pct_cierre_agendas
--   arriba:  sin_asignar {leads, califican_por_inversion, aplicaron} (solo el admin)
-- No cambia ni saca ningún campo existente.
-- =====================================================================

create or replace function public.crm_team_metrics(p_launch text default null, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  launch text := coalesce(p_launch, private.current_launch());
  is_admin boolean := private.is_superadmin();
  my_sdr uuid := private.my_sdr_id();
  my_closer uuid := private.my_closer_id();
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  res jsonb;
begin
  if not (is_admin or my_sdr is not null or my_closer is not null) then
    raise exception 'Sin permisos';
  end if;

  with
  cohort as (
    select ll.*, l.sdr_id
    from public.lead_launches ll join public.leads l on l.id = ll.lead_id
    where ll.launch_id = launch
      and (p_from is null or (ll.optin_at at time zone 'America/Argentina/Buenos_Aires')::date >= p_from)
      and (p_to is null or (ll.optin_at at time zone 'America/Argentina/Buenos_Aires')::date <= p_to)
  ),
  -- Tiempos de cada lead: cuándo se asignó, primer toque del SDR y primera vez que contestó
  tiempos as (
    select c.id, c.sdr_id, a.asignado_at,
      (select min(e.created_at) from public.lead_events e
        where e.lead_id = c.lead_id and e.launch_id = c.launch_id and e.created_by is not null
          and e.kind in ('dial', 'estado', 'contacto', 'agenda') and e.created_at >= a.asignado_at) primer_toque,
      (select min(e.created_at) from public.lead_events e
        where e.lead_id = c.lead_id and e.launch_id = c.launch_id and e.kind = 'contacto'
          and e.summary like '%¿Contestó? Sí%') primera_respuesta
    from cohort c
    cross join lateral (
      select coalesce((select max(e.created_at) from public.lead_events e
                       where e.lead_id = c.lead_id and e.launch_id = c.launch_id and e.kind = 'sdr'), c.optin_at, c.created_at) asignado_at
    ) a
    where c.sdr_id is not null
  ),
  -- Dials hechos por cada persona (botón de dial o «No atendió»), en el período
  dials as (
    select r.id rep_id,
      count(*) filter (where (p_from is null or d.dia >= p_from) and (p_to is null or d.dia <= p_to)) n,
      count(*) filter (where d.dia = hoy) hoy,
      count(distinct d.dia) filter (where (p_from is null or d.dia >= p_from) and (p_to is null or d.dia <= p_to)) dias_activos,
      count(*) filter (where (p_from is null or d.dia >= p_from) and (p_to is null or d.dia <= p_to)
                         and d.outcome = 'atendio') atendidos,
      count(*) filter (where (p_from is null or d.dia >= p_from) and (p_to is null or d.dia <= p_to)
                         and d.outcome in ('atendio', 'no_atendio')) con_outcome
    from public.sales_reps r
    join (
      select e.created_by, (e.created_at at time zone 'America/Argentina/Buenos_Aires')::date dia,
        case when e.kind = 'dial' then e.data ->> 'outcome' end outcome
      from public.lead_events e
      where e.launch_id = launch
        and ((e.kind = 'dial' and e.summary like 'Dial %') or (e.kind = 'estado' and e.data ->> 'to' = 'No atendió'))
    ) d on d.created_by = r.profile_id
    group by r.id
  ),
  calls as (
    select c.*, ll.lead_id,
      (c.scheduled_at at time zone 'America/Argentina/Buenos_Aires')::date dia,
      (select coalesce(sum(p.amount), 0) from public.payments p where p.sales_call_id = c.id and p.paid_at is not null) cobrado
    from public.sales_calls c join public.lead_launches ll on ll.id = c.lead_launch_id
    where ll.launch_id = launch
      and not (c.status = 'cancelada' and c.attendance is null) -- reprogramadas
  ),
  calls_p as (
    select * from calls where (p_from is null or dia >= p_from) and (p_to is null or dia <= p_to)
  ),
  sdr as (
    select r.id, r.name, r.sdr_status,
      count(c.id) asignados,
      count(c.id) filter (where c.contact_attempts > 0) contactados,
      count(c.id) filter (where c.contact_attempts = 0 and c.finalized_at is null
                            and coalesce(c.post_class_status, '') not in ('Agendado', 'Cliente', 'Cliente · falta onboarding')) sin_tocar,
      coalesce(sum(c.contact_attempts), 0) intentos,
      count(c.id) filter (where c.answered) contestaron,
      count(c.id) filter (where c.real_conversation) conversaciones,
      count(c.id) filter (where c.sdr_qualified) calificados,
      count(c.id) filter (where c.asked_agents) pidieron_agentes,
      count(c.id) filter (where c.agents_sent is not null and c.agents_sent not in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb)) agentes_enviados,
      count(c.id) filter (where c.next_followup_at < now() and c.finalized_at is null) seguimientos_vencidos,
      count(c.id) filter (where c.finalized_at is not null) finalizados,
      count(c.id) filter (where c.no_cuenta_reason is not null) no_cuentan,
      count(c.id) filter (where c.califica) califican_inversion,
      count(c.id) filter (where c.route = 'aplicado') aplicaron
    from public.sales_reps r
    left join cohort c on c.sdr_id = r.id
    where r.sdr_status is not null
    group by r.id
  ),
  sdr_t as (
    select t.sdr_id,
      percentile_cont(0.5) within group (order by extract(epoch from t.primer_toque - t.asignado_at) / 60)
        filter (where t.primer_toque is not null) speed_mediana_min,
      avg(extract(epoch from t.primer_toque - t.asignado_at) / 60) filter (where t.primer_toque is not null) speed_promedio_min,
      count(*) filter (where t.primer_toque - t.asignado_at <= interval '5 minutes') en_5_min,
      count(*) filter (where t.primer_toque - t.asignado_at <= interval '1 hour') en_1_hora,
      count(*) filter (where t.primer_toque is not null) tocados,
      percentile_cont(0.5) within group (order by extract(epoch from t.primera_respuesta - t.asignado_at) / 3600)
        filter (where t.primera_respuesta is not null) horas_hasta_respuesta
    from tiempos t group by t.sdr_id
  ),
  sdr_calls as (
    select c.sdr_id,
      count(*) agendas,
      count(*) filter (where c.attendance = 'se_presento' or c.result is not null) se_presentaron,
      count(*) filter (where c.attendance in ('se_presento', 'no_show', 'cancelo') or c.result is not null) con_asistencia,
      count(*) filter (where c.result = 'cerro') ventas,
      coalesce(sum(c.amount_total) filter (where c.result = 'cerro'), 0) vendido,
      coalesce(sum(c.cobrado) filter (where c.result = 'cerro'), 0) cobrado
    from calls_p c where c.sdr_id is not null group by c.sdr_id
  ),
  sdr_motivos as (
    select c.sdr_id, jsonb_object_agg(c.finalized_reason, c.n) motivos
    from (select sdr_id, finalized_reason, count(*) n from cohort where finalized_reason is not null group by 1, 2) c
    group by c.sdr_id
  ),
  sdr_rows as (
    select jsonb_build_object(
      'id', s.id, 'nombre', s.name, 'estado', s.sdr_status,
      'leads_asignados', s.asignados,
      'leads_contactados', s.contactados,
      'leads_sin_tocar', s.sin_tocar,
      'pct_contactados', round(100.0 * s.contactados / nullif(s.asignados, 0), 1),
      'dials', coalesce(d.n, 0),
      'dials_hoy', coalesce(d.hoy, 0),
      'dials_por_dia', round(coalesce(d.n, 0)::numeric / nullif(d.dias_activos, 0), 1),
      'dials_atendidos', coalesce(d.atendidos, 0),
      'pick_up_rate_por_dial', round(100.0 * d.atendidos / nullif(d.con_outcome, 0), 1),
      'intentos_por_lead', round(s.intentos::numeric / nullif(s.contactados, 0), 1),
      'speed_to_lead_mediana_min', round(t.speed_mediana_min::numeric, 1),
      'speed_to_lead_promedio_min', round(t.speed_promedio_min::numeric, 1),
      'pct_tocados_en_5_min', round(100.0 * t.en_5_min / nullif(s.asignados, 0), 1),
      'pct_tocados_en_1_hora', round(100.0 * t.en_1_hora / nullif(s.asignados, 0), 1),
      'horas_hasta_primera_respuesta', round(t.horas_hasta_respuesta::numeric, 1),
      'contestaron', s.contestaron,
      'pick_up_rate', round(100.0 * s.contestaron / nullif(s.contactados, 0), 1),
      'conversaciones_reales', s.conversaciones,
      'pct_conversaciones', round(100.0 * s.conversaciones / nullif(s.contestaron, 0), 1),
      'calificados', s.calificados,
      'pct_calificados', round(100.0 * s.calificados / nullif(s.conversaciones, 0), 1),
      'pidieron_agentes', s.pidieron_agentes,
      'agentes_enviados', s.agentes_enviados,
      'agendas', coalesce(k.agendas, 0),
      'pct_agenda_sobre_calificados', round(100.0 * coalesce(k.agendas, 0) / nullif(s.calificados, 0), 1),
      'pct_agenda_sobre_contactados', round(100.0 * coalesce(k.agendas, 0) / nullif(s.contactados, 0), 1),
      'show_rate_agendas', round(100.0 * k.se_presentaron / nullif(k.con_asistencia, 0), 1),
      'ventas_de_sus_agendas', coalesce(k.ventas, 0),
      'cash_vendido', coalesce(k.vendido, 0),
      'cash_cobrado', coalesce(k.cobrado, 0),
      'seguimientos_vencidos', s.seguimientos_vencidos,
      'finalizados', s.finalizados,
      'finalizados_por_motivo', coalesce(m.motivos, '{}'::jsonb),
      'no_cuentan', s.no_cuentan,
      'califican_por_inversion', s.califican_inversion,
      'aplicaron', s.aplicaron,
      'pct_cierre_agendas', round(100.0 * coalesce(k.ventas, 0) / nullif(k.agendas, 0), 1)
    ) fila
    from sdr s
    left join dials d on d.rep_id = s.id
    left join sdr_t t on t.sdr_id = s.id
    left join sdr_calls k on k.sdr_id = s.id
    left join sdr_motivos m on m.sdr_id = s.id
    where is_admin or s.id = my_sdr
  ),
  closer_rows as (
    select jsonb_build_object(
      'id', r.id, 'nombre', r.name, 'estado', r.closer_status,
      'calls_agendadas', count(c.id),
      'calls_proximas', count(c.id) filter (where c.status = 'agendada' and c.scheduled_at > now()),
      'calls_hoy', count(c.id) filter (where c.dia = hoy),
      'calls_sin_resultado', count(c.id) filter (where c.scheduled_at < now() and c.result is null
                                                   and coalesce(c.attendance, 'se_presento') = 'se_presento'),
      'se_presentaron', count(c.id) filter (where c.attendance = 'se_presento' or c.result is not null),
      'no_shows', count(c.id) filter (where c.attendance = 'no_show'),
      'cancelaron', count(c.id) filter (where c.attendance = 'cancelo'),
      'show_rate', round(100.0 * count(c.id) filter (where c.attendance = 'se_presento' or c.result is not null)
                   / nullif(count(c.id) filter (where c.attendance in ('se_presento', 'no_show', 'cancelo') or c.result is not null), 0), 1),
      'ventas', count(c.id) filter (where c.result = 'cerro'),
      'no_cerro', count(c.id) filter (where c.result = 'no_cerro'),
      'en_seguimiento', count(c.id) filter (where c.result = 'seguimiento'),
      'close_rate', round(100.0 * count(c.id) filter (where c.result = 'cerro')
                    / nullif(count(c.id) filter (where c.attendance = 'se_presento' or c.result is not null), 0), 1),
      'close_rate_sobre_agendadas', round(100.0 * count(c.id) filter (where c.result = 'cerro') / nullif(count(c.id), 0), 1),
      'cash_vendido', coalesce(sum(c.amount_total) filter (where c.result = 'cerro'), 0),
      'cash_cobrado', coalesce(sum(c.cobrado) filter (where c.result = 'cerro'), 0),
      'cash_pendiente', coalesce(sum(c.amount_total - c.cobrado) filter (where c.result = 'cerro'), 0),
      'pct_cobrado', round(100.0 * sum(c.cobrado) filter (where c.result = 'cerro')
                     / nullif(sum(c.amount_total) filter (where c.result = 'cerro'), 0), 1),
      'ticket_promedio', round(avg(c.amount_total) filter (where c.result = 'cerro'), 2),
      'cash_por_call', round(coalesce(sum(c.cobrado) filter (where c.result = 'cerro'), 0)
                       / nullif(count(c.id) filter (where c.attendance = 'se_presento' or c.result is not null), 0), 2),
      'ventas_hoy', count(c.id) filter (where c.result = 'cerro' and (c.closed_at at time zone 'America/Argentina/Buenos_Aires')::date = hoy),
      'horas_hasta_cargar_resultado', round((percentile_cont(0.5) within group (order by extract(epoch from c.closed_at - c.scheduled_at) / 3600)
                                       filter (where c.closed_at is not null))::numeric, 1),
      'dias_de_agenda_a_call', round((percentile_cont(0.5) within group (order by extract(epoch from c.scheduled_at - c.created_at) / 86400))::numeric, 1)
    ) fila
    from public.sales_reps r
    left join calls_p c on c.closer_id = r.id
    where r.closer_status is not null and (is_admin or r.id = my_closer)
    group by r.id
  )
  select jsonb_build_object(
    'launch', launch, 'desde', p_from, 'hasta', p_to, 'generado', now(),
    'sdr', coalesce((select jsonb_agg(fila order by fila ->> 'nombre') from sdr_rows), '[]'::jsonb),
    'closer', coalesce((select jsonb_agg(fila order by fila ->> 'nombre') from closer_rows), '[]'::jsonb),
    -- Leads del período que todavía no tienen SDR (solo el admin)
    'sin_asignar', case when is_admin then (
      select jsonb_build_object(
        'leads', count(*),
        'califican_por_inversion', count(*) filter (where c.califica),
        'aplicaron', count(*) filter (where c.route = 'aplicado'))
      from cohort c where c.sdr_id is null) end
  ) into res;
  return res;
end;
$function$;
