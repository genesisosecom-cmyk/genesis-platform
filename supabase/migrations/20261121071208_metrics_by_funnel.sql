-- =====================================================================
-- Paso 5 · Métricas por funnel.
-- crm_team_metrics, crm_ads_metrics y crm_launch_progress suman p_funnel:
-- con p_funnel y sin p_launch toman todos los ciclos de ese funnel. Con
-- p_launch (o sin ninguno de los dos) se comportan igual que antes.
-- crm_launch_progress sin argumentos devuelve el consolidado de todos los funnels.
--
-- crm_team_metrics, crm_ads_metrics y private.ads_leads tienen en producción
-- ajustes que no están en las migraciones del repo. Por eso acá no se reescriben:
-- se toma la definición viva y se le cambia solo el filtro por ciclo. Si alguna
-- de las líneas esperadas no está, la migración falla sin tocar nada.
-- =====================================================================

do $mig$
declare
  d text;
  decl constant text := $x$launch text := case when p_launch is null and p_funnel is not null then null else coalesce(p_launch, private.current_launch()) end;
  -- Con p_funnel y sin p_launch: todos los ciclos de ese funnel.
  launches text[] := case when launch is not null then array[launch] else array(select id from public.launches where funnel_id = p_funnel) end;$x$;
begin
  -- Reemplaza `a` por `b`; falla si `a` no aparece.
  create function pg_temp.swap(s text, a text, b text) returns text language plpgsql as $f$
  begin
    if position(a in s) = 0 then raise exception 'metrics_by_funnel: no encontré «%»', a; end if;
    return replace(s, a, b);
  end $f$;

  -- crm_team_metrics
  d := pg_get_functiondef('public.crm_team_metrics(text, date, date)'::regprocedure);
  d := pg_temp.swap(d, 'p_to date DEFAULT NULL::date)', 'p_to date DEFAULT NULL::date, p_funnel text DEFAULT NULL::text)');
  d := pg_temp.swap(d, 'launch text := coalesce(p_launch, private.current_launch());', decl);
  d := pg_temp.swap(d, 'll.launch_id = launch', 'll.launch_id = any (launches)');
  d := pg_temp.swap(d, 'e.launch_id = launch', 'e.launch_id = any (launches)');
  d := pg_temp.swap(d, $x$'launch', launch,$x$, $x$'launch', launch, 'funnel', p_funnel,$x$);
  if d ~ '= launch\M' then raise exception 'metrics_by_funnel: crm_team_metrics todavía filtra por un solo ciclo'; end if;
  drop function public.crm_team_metrics(text, date, date);
  execute d;

  -- private.ads_leads
  d := pg_get_functiondef('private.ads_leads(text, date, date)'::regprocedure);
  d := pg_temp.swap(d, 'p_launch text,', 'p_launches text[],');
  d := pg_temp.swap(d, 'll.launch_id = p_launch', 'll.launch_id = any (p_launches)');
  drop function private.ads_leads(text, date, date);
  execute d;

  -- crm_ads_metrics
  d := pg_get_functiondef('public.crm_ads_metrics(text, date, date)'::regprocedure);
  d := pg_temp.swap(d, 'p_to date DEFAULT NULL::date)', 'p_to date DEFAULT NULL::date, p_funnel text DEFAULT NULL::text)');
  d := pg_temp.swap(d, 'launch text := coalesce(p_launch, private.current_launch());', decl);
  d := pg_temp.swap(d, 'private.ads_leads(launch,', 'private.ads_leads(launches,');
  d := pg_temp.swap(d, 'launch_id = launch', 'launch_id = any (launches)');
  d := pg_temp.swap(d, $x$'launch', launch,$x$, $x$'launch', launch, 'funnel', p_funnel,$x$);
  if d ~ '= launch\M' then raise exception 'metrics_by_funnel: crm_ads_metrics todavía filtra por un solo ciclo'; end if;
  drop function public.crm_ads_metrics(text, date, date);
  execute d;

  drop function pg_temp.swap(text, text, text);
end
$mig$;

-- crm_launch_progress: caja y ventas de un ciclo, de un funnel o de todos.
drop function public.crm_launch_progress(text);
CREATE OR REPLACE FUNCTION public.crm_launch_progress(p_launch text DEFAULT NULL::text, p_funnel text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when not (private.is_superadmin() or private.my_sdr_id() is not null or private.my_closer_id() is not null) then null else
    jsonb_build_object(
      'cash', coalesce((select sum(p.amount) from public.payments p join public.sales_calls c on c.id = p.sales_call_id
                        join public.lead_launches ll on ll.id = c.lead_launch_id
                        where ll.launch_id in (select x.id from public.launches x where x.id = p_launch or (p_launch is null and (p_funnel is null or x.funnel_id = p_funnel))) and p.paid_at is not null), 0),
      'cash_today', coalesce((select sum(p.amount) from public.payments p join public.sales_calls c on c.id = p.sales_call_id
                        join public.lead_launches ll on ll.id = c.lead_launch_id
                        where ll.launch_id in (select x.id from public.launches x where x.id = p_launch or (p_launch is null and (p_funnel is null or x.funnel_id = p_funnel))) and p.paid_at = (now() at time zone 'America/Argentina/Buenos_Aires')::date), 0),
      'sales', (select count(*) from public.sales_calls c join public.lead_launches ll on ll.id = c.lead_launch_id
                where ll.launch_id in (select x.id from public.launches x where x.id = p_launch or (p_launch is null and (p_funnel is null or x.funnel_id = p_funnel))) and c.result = 'cerro'),
      'sales_today', (select count(*) from public.sales_calls c join public.lead_launches ll on ll.id = c.lead_launch_id
                where ll.launch_id in (select x.id from public.launches x where x.id = p_launch or (p_launch is null and (p_funnel is null or x.funnel_id = p_funnel))) and c.result = 'cerro'
                  and (c.closed_at at time zone 'America/Argentina/Buenos_Aires')::date = (now() at time zone 'America/Argentina/Buenos_Aires')::date)
    ) end;
$function$;

revoke all on function public.crm_team_metrics(text, date, date, text) from public, anon;
grant execute on function public.crm_team_metrics(text, date, date, text) to authenticated, service_role;
revoke all on function public.crm_ads_metrics(text, date, date, text) from public, anon;
grant execute on function public.crm_ads_metrics(text, date, date, text) to authenticated, service_role;
revoke all on function public.crm_launch_progress(text, text) from public, anon;
grant execute on function public.crm_launch_progress(text, text) to authenticated, service_role;
revoke all on function private.ads_leads(text[], date, date) from public, anon, authenticated;

