-- =====================================================================
-- Paso 10 · Resultados.
-- content_results (por pieza), keyword_results (por palabra y semana),
-- subavatar_results y funnel_overview. Nada se carga a mano: todo sale de
-- lead_launches (entry_content_id, entry_keyword, subavatar) cruzado con
-- sales_calls y payments. Las vistas respetan el RLS de sus tablas.
-- =====================================================================

-- Una fila por lead del ciclo con lo que pasó después (llamadas, ventas, caja).
create view public.lead_results with (security_invoker = true) as
select
  ll.id, ll.lead_id, ll.launch_id, la.funnel_id, ll.created_at,
  (ll.created_at at time zone 'America/Argentina/Buenos_Aires')::date as dia,
  ll.entry_content_id, upper(ll.entry_keyword) as keyword, ll.subavatar, ll.pain, ll.lane, ll.stage,
  coalesce(ll.califica, false) as calificado,
  (ll.applied_at is not null and ll.route is distinct from 'rechazado') as aplico,
  exists (select 1 from public.sales_calls c where c.lead_launch_id = ll.id and not (c.status = 'cancelada' and c.attendance is null)) as llamada,
  (select count(*) from public.sales_calls c where c.lead_launch_id = ll.id and c.result = 'cerro') as ventas,
  (select count(*) from public.sales_calls c where c.lead_launch_id = ll.id and c.result = 'cerro' and c.program ilike '%lite%') as ventas_lite,
  coalesce((select sum(p.amount) from public.payments p join public.sales_calls c on c.id = p.sales_call_id
            where c.lead_launch_id = ll.id and p.paid_at is not null), 0) as caja
from public.lead_launches ll
join public.launches la on la.id = ll.launch_id
where ll.no_cuenta_reason is null;

-- Por pieza: conversaciones que abrió, calificadas, aplicaciones, llamadas, ventas y caja.
create view public.content_results with (security_invoker = true) as
select
  cp.id as piece_id, cp.funnel_id, cp.week_id, cp.publish_at, cp.format, cp.title, cp.subavatar, cp.pain, cp.keyword, cp.status,
  count(r.id) as conversaciones,
  count(r.id) filter (where r.calificado) as calificadas,
  count(r.id) filter (where r.aplico) as aplicaciones,
  count(r.id) filter (where r.llamada) as llamadas,
  coalesce(sum(r.ventas), 0) as ventas,
  coalesce(sum(r.caja), 0) as caja
from public.content_pieces cp
left join public.lead_results r on r.entry_content_id = cp.id
group by cp.id;

-- Por palabra y semana (lunes): conversaciones y calificadas.
create view public.keyword_results with (security_invoker = true) as
select
  r.funnel_id, r.keyword, date_trunc('week', r.dia::timestamp)::date as semana,
  count(*) as conversaciones,
  count(*) filter (where r.calificado) as calificadas,
  count(*) filter (where r.aplico) as aplicaciones,
  count(*) filter (where r.llamada) as llamadas,
  coalesce(sum(r.ventas), 0) as ventas,
  coalesce(sum(r.caja), 0) as caja
from public.lead_results r
where r.keyword is not null
group by 1, 2, 3;

-- Por subavatar: la validación del SOP 01 (una semana por subavatar: plata, interés y entrada).
create function public.subavatar_results(p_funnel text, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_superadmin() then raise exception 'Sin permisos'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.subavatar)
    from (
      select coalesce(r.subavatar, 'sin clasificar') as subavatar,
        count(*) as conversaciones,
        count(*) filter (where r.calificado) as calificadas,
        count(*) filter (where r.aplico) as aplicaciones,
        count(*) filter (where r.llamada) as llamadas,
        coalesce(sum(r.ventas), 0) as ventas,
        coalesce(sum(r.ventas_lite), 0) as ventas_lite,
        coalesce(sum(r.caja), 0) as caja
      from public.lead_results r
      where r.funnel_id = p_funnel and (p_from is null or r.dia >= p_from) and (p_to is null or r.dia <= p_to)
      group by 1
    ) x), '[]'::jsonb);
end;
$$;

-- Tablero de un funnel (o de todos, con p_funnel null): leads nuevos, calificados, aplicaciones,
-- llamadas, cierres por programa y caja. Los leads se cuentan por fecha de entrada; las llamadas por
-- fecha agendada; los cierres por fecha de cierre; la caja por fecha de cobro.
create function public.funnel_overview(p_funnel text default null, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  tz constant text := 'America/Argentina/Buenos_Aires';
  res jsonb;
begin
  if not private.is_superadmin() then raise exception 'Sin permisos'; end if;
  with
  ciclos as (select id from public.launches where p_funnel is null or funnel_id = p_funnel),
  leads as (
    select r.* from public.lead_results r
    where r.launch_id in (select id from ciclos) and (p_from is null or r.dia >= p_from) and (p_to is null or r.dia <= p_to)
  ),
  calls as (
    select c.* from public.sales_calls c join public.lead_launches ll on ll.id = c.lead_launch_id
    where ll.launch_id in (select id from ciclos) and ll.no_cuenta_reason is null
  ),
  cierres as (
    select coalesce(nullif(trim(c.program), ''), 'Sin programa') as programa, count(*) as ventas, coalesce(sum(c.amount_total), 0) as vendido
    from calls c
    where c.result = 'cerro'
      and (p_from is null or (c.closed_at at time zone tz)::date >= p_from) and (p_to is null or (c.closed_at at time zone tz)::date <= p_to)
    group by 1
  )
  select jsonb_build_object(
    'funnel', p_funnel, 'desde', p_from, 'hasta', p_to,
    'leads', (select count(*) from leads),
    'optins', (select count(*) from leads l join public.lead_launches ll on ll.id = l.id where ll.optin_at is not null),
    'calificados', (select count(*) from leads where calificado),
    'aplicaciones', (select count(*) from leads where aplico),
    'conversaciones', (select count(*) from leads where keyword is not null),
    'conversaciones_calificadas', (select count(*) from leads where keyword is not null and calificado),
    'conversaciones_por_palabra', coalesce((select jsonb_object_agg(k.keyword, k.n) from (select keyword, count(*) n from leads where keyword is not null group by 1) k), '{}'::jsonb),
    'llamadas', (select count(*) from calls c where not (c.status = 'cancelada' and c.attendance is null)
                   and (p_from is null or (c.scheduled_at at time zone tz)::date >= p_from) and (p_to is null or (c.scheduled_at at time zone tz)::date <= p_to)),
    'cierres', (select coalesce(sum(ventas), 0) from cierres),
    'cierres_os', (select coalesce(sum(ventas), 0) from cierres where programa ilike '%os%' and programa not ilike '%lite%'),
    'cierres_lite', (select coalesce(sum(ventas), 0) from cierres where programa ilike '%lite%'),
    'cierres_por_programa', coalesce((select jsonb_agg(to_jsonb(c) order by c.vendido desc) from cierres c), '[]'::jsonb),
    'cash', coalesce((select sum(p.amount) from public.payments p join calls c on c.id = p.sales_call_id
                      where p.paid_at is not null and (p_from is null or p.paid_at >= p_from) and (p_to is null or p.paid_at <= p_to)), 0)
  ) into res;
  return res;
end;
$$;

revoke all on function public.subavatar_results(text, date, date) from public, anon;
grant execute on function public.subavatar_results(text, date, date) to authenticated;
revoke all on function public.funnel_overview(text, date, date) from public, anon;
grant execute on function public.funnel_overview(text, date, date) to authenticated;
revoke all on public.lead_results, public.content_results, public.keyword_results from anon;
grant select on public.lead_results, public.content_results, public.keyword_results to authenticated;
