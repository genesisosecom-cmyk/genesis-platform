-- =====================================================================
-- Métricas de pauta y embudo (lo que medía el tracker viejo): crm_ads_metrics.
-- Solo superadmin. Días en hora de Argentina. Sin rango = todo el lanzamiento (del primer día
-- con visitas u opt-ins hasta hoy). La fuente «Test» no cuenta. Los leads «No cuentan»
-- (duplicados, pruebas…) quedan afuera de las métricas y se informan aparte.
-- El detalle por SDR y closer sigue en crm_team_metrics.
-- =====================================================================

-- País por prefijo del teléfono (solo dígitos), probando el prefijo más largo primero.
create or replace function private.phone_country(p_phone text)
returns text language sql immutable set search_path = '' as $$
  with d as (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') n)
  select case
    when n = '' then 'Sin teléfono'
    when n like '598%' then 'Uruguay'
    when n like '595%' then 'Paraguay'
    when n like '593%' then 'Ecuador'
    when n like '591%' then 'Bolivia'
    when n like '507%' then 'Panamá'
    when n like '506%' then 'Costa Rica'
    when n like '502%' then 'Guatemala'
    when n like '503%' then 'El Salvador'
    when n like '504%' then 'Honduras'
    when n like '505%' then 'Nicaragua'
    when n like '54%' then 'Argentina'
    when n like '52%' then 'México'
    when n like '57%' then 'Colombia'
    when n like '34%' then 'España'
    when n like '56%' then 'Chile'
    when n like '51%' then 'Perú'
    when n like '58%' then 'Venezuela'
    when n like '55%' then 'Brasil'
    when n like '53%' then 'Cuba'
    when n like '1%' then 'EEUU/Canadá'
    else 'Otros'
  end from d;
$$;

-- % con un decimal; null si no hay base.
create or replace function private.pct(n numeric, d numeric)
returns numeric language sql immutable set search_path = '' as $$
  select round(100.0 * n / nullif(d, 0), 1);
$$;

-- Opt-ins del lanzamiento en el rango, con lo que hace falta para las métricas.
create or replace function private.ads_leads(p_launch text, p_from date, p_to date)
returns table (
  id uuid, lead_id uuid, dia date, pauta boolean, source text, variant text, inversion_meta text,
  califica boolean, toco_grupo boolean, contactado boolean, contesto boolean, sdr_qualified boolean,
  agendo boolean, contact_attempts int, stage text, pais text, no_cuenta boolean, estado text, full_name text, optin_at timestamptz
)
language sql stable set search_path = '' as $$
  select ll.id, ll.lead_id,
    (ll.optin_at at time zone 'America/Argentina/Buenos_Aires')::date,
    ll.source = 'Anuncios de Meta',
    coalesce(ll.source, 'Sin fuente'),
    nullif(ll.variant, ''),
    ll.inversion_meta,
    coalesce(ll.califica, false),
    ll.toco_grupo,
    ll.contact_attempts > 0 or ll.answered is not null or ll.stage not in ('Nuevo', 'Próximo ciclo'),
    coalesce(ll.answered, false),
    coalesce(ll.sdr_qualified, false),
    coalesce(ll.agendo, false) or exists (select 1 from public.sales_calls c where c.lead_launch_id = ll.id),
    ll.contact_attempts,
    ll.stage,
    private.phone_country(l.phone),
    ll.no_cuenta_reason is not null,
    -- Mismo estado que muestra la tarjeta del tracker de la SDR
    case
      when ll.no_cuenta_reason is not null then 'No cuenta'
      when ll.finalized_at is not null then 'Finalizado'
      when ll.agendo then 'Agendado'
      when l.sdr_id is not null and ll.followup_started_at is not null then 'En seguimiento'
      when ll.sdr_qualified then 'Calificó · falta agendar'
      when ll.answered then 'Contestó · falta calificar'
      when ll.contact_attempts > 0 then 'Con dials · falta marcar cómo salió'
      when l.sdr_id is null then 'Sin SDR'
      else 'Sin tocar'
    end,
    l.full_name,
    ll.optin_at
  from public.lead_launches ll join public.leads l on l.id = ll.lead_id
  where ll.launch_id = p_launch and ll.optin_at is not null
    and (ll.optin_at at time zone 'America/Argentina/Buenos_Aires')::date between p_from and p_to;
$$;

-- Resumen de un conjunto de opt-ins y visitas (se usa para el total y para cada día).
create or replace function private.ads_summary(l jsonb, v jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'optins', o, 'optins_pauta', op, 'optins_sin_anuncio', o - op,
    'calificados', c, 'calificados_pauta', cp, 'pct_calificados_pauta', private.pct(cp, op),
    'visitas', vt, 'visitas_pauta', vp,
    'conversion_landing', private.pct(op, vp),
    'calificados_por_visita', private.pct(cp, vp),
    'grupo', g, 'pct_grupo', private.pct(g, o), 'grupo_pauta', gp, 'pct_grupo_pauta', private.pct(gp, op),
    'contactados', ct, 'tasa_contacto', private.pct(ct, o),
    'contestaron', an, 'pickup', private.pct(an, ct), 'pct_contestaron', private.pct(an, o),
    'calificaron_sdr', q, 'calificacion_real', private.pct(q, c),
    'agendaron', ag, 'tasa_agenda', private.pct(ag, c)
  )
  from (select
    coalesce((l ->> 'o')::int, 0) o, coalesce((l ->> 'op')::int, 0) op, coalesce((l ->> 'c')::int, 0) c, coalesce((l ->> 'cp')::int, 0) cp,
    coalesce((l ->> 'g')::int, 0) g, coalesce((l ->> 'gp')::int, 0) gp, coalesce((l ->> 'ct')::int, 0) ct, coalesce((l ->> 'an')::int, 0) an,
    coalesce((l ->> 'q')::int, 0) q, coalesce((l ->> 'ag')::int, 0) ag,
    coalesce((v ->> 'vt')::int, 0) vt, coalesce((v ->> 'vp')::int, 0) vp) x;
$$;

create or replace function public.crm_ads_metrics(p_launch text default null, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch text := coalesce(p_launch, private.current_launch());
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  d_from date;
  d_to date;
  resumen jsonb; por_dia jsonb; versiones jsonb; ganador jsonb; fuentes jsonb;
  inversion jsonb; paises jsonb; embudo jsonb; estados jsonb; stages jsonb; intentos jsonb;
  ventas jsonb; vencidas jsonb; proximas jsonb; no_cuentan int;
  a record; b record; pool numeric; z numeric; pval numeric;
begin
  if not private.is_superadmin() then
    raise exception 'Sin permisos';
  end if;

  d_to := coalesce(p_to, hoy);
  d_from := coalesce(p_from, least(
    (select min(day) from public.landing_visits where launch_id = launch and source <> 'Test'),
    (select min((optin_at at time zone 'America/Argentina/Buenos_Aires')::date) from public.lead_launches where launch_id = launch)
  ), d_to);

  create temp table if not exists _ads_l on commit drop as select * from private.ads_leads(launch, d_from, d_to) limit 0;
  truncate _ads_l;
  insert into _ads_l select * from private.ads_leads(launch, d_from, d_to);
  create temp table if not exists _ads_v (day date, source text, variant text, visits int) on commit drop;
  truncate _ads_v;
  insert into _ads_v select day, source, nullif(variant, ''), visits from public.landing_visits
    where launch_id = launch and source <> 'Test' and day between d_from and d_to;

  select count(*) into no_cuentan from _ads_l where no_cuenta;

  -- 1 y 2. Resumen y por día (mismo cálculo; grouping sets: total + cada día)
  with dias as (select generate_series(d_from, d_to, interval '1 day')::date dia),
  l as (
    select dia, grouping(dia) total, jsonb_build_object(
      'o', count(*), 'op', count(*) filter (where pauta), 'c', count(*) filter (where califica),
      'cp', count(*) filter (where califica and pauta), 'g', count(*) filter (where toco_grupo),
      'gp', count(*) filter (where toco_grupo and pauta), 'ct', count(*) filter (where contactado),
      'an', count(*) filter (where contesto), 'q', count(*) filter (where sdr_qualified and califica),
      'ag', count(*) filter (where agendo and califica)) j
    from _ads_l where not no_cuenta group by grouping sets ((dia), ())
  ),
  v as (
    select day dia, grouping(day) total, jsonb_build_object('vt', sum(visits), 'vp', sum(visits) filter (where source = 'Anuncios de Meta')) j
    from _ads_v group by grouping sets ((day), ())
  )
  select
    private.ads_summary((select j from l where total = 1), (select j from v where total = 1)),
    (select jsonb_agg(jsonb_build_object('dia', d.dia) || private.ads_summary(l.j, v.j) order by d.dia)
       from dias d left join l on l.total = 0 and l.dia = d.dia left join v on v.total = 0 and v.dia = d.dia)
  into resumen, por_dia;

  -- 3. Test de versiones (visitantes de todas las fuentes salvo «Test»)
  with vs as (select unnest(array['1', '2', '3']) variant),
  vv as (select variant, sum(visits) n from _ads_v where variant is not null group by 1),
  lv as (select variant, count(*) o, count(*) filter (where califica) c, count(*) filter (where toco_grupo) g
         from _ads_l where not no_cuenta and variant is not null group by 1),
  serie as (
    select x.variant, jsonb_agg(jsonb_build_object('dia', x.dia, 'visitantes', coalesce(x.vis, 0), 'optins', coalesce(x.o, 0), 'calificados', coalesce(x.c, 0)) order by x.dia) s
    from (
      select vs.variant, d.dia,
        (select sum(visits) from _ads_v where variant = vs.variant and day = d.dia) vis,
        (select count(*) from _ads_l where not no_cuenta and variant = vs.variant and dia = d.dia) o,
        (select count(*) from _ads_l where not no_cuenta and variant = vs.variant and dia = d.dia and califica) c
      from vs cross join (select generate_series(d_from, d_to, interval '1 day')::date dia) d
    ) x group by x.variant
  )
  select case when exists (select 1 from vv) or exists (select 1 from lv) then
    jsonb_agg(jsonb_build_object(
      'version', vs.variant,
      'visitantes', coalesce(vv.n, 0), 'optins', coalesce(lv.o, 0),
      'optins_por_visitante', private.pct(lv.o, vv.n),
      'calificados', coalesce(lv.c, 0), 'pct_calificados', private.pct(lv.c, lv.o),
      'calificados_por_visitante', private.pct(lv.c, vv.n),
      'grupo', coalesce(lv.g, 0), 'pct_grupo', private.pct(lv.g, lv.o),
      'serie', serie.s) order by vs.variant)
    else '[]'::jsonb end
  into versiones
  from vs left join vv using (variant) left join lv using (variant) left join serie using (variant);

  -- Ganador: prueba z de dos proporciones entre las dos mejores (opt-ins / visitantes)
  select x.version, x.n, x.k into a from (
    select v ->> 'version' version, (v ->> 'visitantes')::numeric n, (v ->> 'optins')::numeric k
    from jsonb_array_elements(versiones) v where (v ->> 'visitantes')::numeric > 0
    order by (v ->> 'optins')::numeric / (v ->> 'visitantes')::numeric desc, version limit 1) x;
  select x.version, x.n, x.k into b from (
    select v ->> 'version' version, (v ->> 'visitantes')::numeric n, (v ->> 'optins')::numeric k
    from jsonb_array_elements(versiones) v where (v ->> 'visitantes')::numeric > 0
    order by (v ->> 'optins')::numeric / (v ->> 'visitantes')::numeric desc, version offset 1 limit 1) x;
  if a.version is not null and b.version is not null then
    pool := (a.k + b.k) / (a.n + b.n);
    if pool > 0 and pool < 1 then
      z := (a.k / a.n - b.k / b.n) / sqrt(pool * (1 - pool) * (1 / a.n + 1 / b.n));
      pval := erfc(abs(z)::float8 / sqrt(2::float8));
    end if;
    ganador := jsonb_build_object('version', a.version, 'contra', b.version, 'z', round(z, 2),
      'confianza', round(100 * (1 - pval)::numeric, 1));
  end if;

  -- 4. De dónde vienen los opt-ins
  with s as (select source from _ads_v union select source from _ads_l)
  select jsonb_agg(jsonb_build_object(
      'fuente', s.source,
      'visitas', (select coalesce(sum(visits), 0) from _ads_v where source = s.source),
      'optins', (select count(*) from _ads_l where not no_cuenta and source = s.source),
      'calificados', (select count(*) from _ads_l where not no_cuenta and source = s.source and califica),
      'grupo', (select count(*) from _ads_l where not no_cuenta and source = s.source and toco_grupo))
    order by (select count(*) from _ads_l where not no_cuenta and source = s.source) desc,
             (select coalesce(sum(visits), 0) from _ads_v where source = s.source) desc)
  into fuentes from s;

  -- 5. Qué respondieron (solo pauta)
  select jsonb_agg(jsonb_build_object('opcion', k, 'leads', n, 'califican', c) order by n desc) into inversion
  from (select coalesce(inversion_meta, 'Sin dato') k, count(*) n, count(*) filter (where califica) c
        from _ads_l where pauta and not no_cuenta group by 1) x;
  select jsonb_agg(jsonb_build_object('pais', k, 'leads', n, 'califican', c) order by n desc) into paises
  from (select pais k, count(*) n, count(*) filter (where califica) c
        from _ads_l where pauta and not no_cuenta group by 1) x;

  -- 6. Embudo del equipo
  select jsonb_build_object(
    'optins', count(*),
    'contactados', count(*) filter (where contactado),
    'contestaron', count(*) filter (where contesto),
    'calificaron_sdr', count(*) filter (where sdr_qualified),
    'agendaron', count(*) filter (where agendo),
    'se_presentaron', count(*) filter (where exists (select 1 from public.sales_calls c where c.lead_launch_id = _ads_l.id
                                        and (c.attendance = 'se_presento' or c.result is not null))),
    'ventas', count(*) filter (where exists (select 1 from public.sales_calls c where c.lead_launch_id = _ads_l.id and c.result = 'cerro')))
  into embudo from _ads_l where not no_cuenta;
  select jsonb_agg(jsonb_build_object('estado', estado, 'leads', n) order by n desc) into estados
  from (select estado, count(*) n from _ads_l group by 1) x;
  select jsonb_agg(jsonb_build_object('stage', stage, 'leads', n) order by n desc) into stages
  from (select stage, count(*) n from _ads_l where not no_cuenta group by 1) x;
  select jsonb_agg(jsonb_build_object('intentos', k, 'leads', n) order by k) into intentos
  from (select case when contact_attempts >= 4 then '4+' else contact_attempts::text end k, count(*) n
        from _ads_l where not no_cuenta group by 1) x;

  -- 7. Ventas del lanzamiento: por programa (fecha de cierre en el rango) y cuotas a hoy
  with c as (
    select c.*, (select coalesce(sum(p.amount), 0) from public.payments p where p.sales_call_id = c.id and p.paid_at is not null) cobrado
    from public.sales_calls c join public.lead_launches ll on ll.id = c.lead_launch_id
    where ll.launch_id = launch and c.result = 'cerro'
  )
  select jsonb_agg(jsonb_build_object('programa', k, 'ventas', n, 'vendido', v, 'cobrado', co) order by v desc) into ventas
  from (select coalesce(nullif(program, ''), 'Sin programa') k, count(*) n, sum(amount_total) v, sum(cobrado) co
        from c where (closed_at at time zone 'America/Argentina/Buenos_Aires')::date between d_from and d_to group by 1) x;

  with q as (
    select p.amount, p.due_date, l.full_name, c.program
    from public.payments p
    join public.sales_calls c on c.id = p.sales_call_id
    join public.lead_launches ll on ll.id = c.lead_launch_id
    join public.leads l on l.id = ll.lead_id
    where ll.launch_id = launch and p.paid_at is null and p.due_date is not null
  )
  select
    jsonb_build_object('cuotas', count(*) filter (where due_date < hoy), 'monto', coalesce(sum(amount) filter (where due_date < hoy), 0),
      'detalle', coalesce(jsonb_agg(jsonb_build_object('nombre', full_name, 'programa', program, 'monto', amount, 'vence', due_date) order by due_date) filter (where due_date < hoy), '[]'::jsonb)),
    jsonb_build_object('cuotas', count(*) filter (where due_date between hoy and hoy + 7), 'monto', coalesce(sum(amount) filter (where due_date between hoy and hoy + 7), 0),
      'detalle', coalesce(jsonb_agg(jsonb_build_object('nombre', full_name, 'programa', program, 'monto', amount, 'vence', due_date) order by due_date) filter (where due_date between hoy and hoy + 7), '[]'::jsonb))
  into vencidas, proximas from q;

  return jsonb_build_object(
    'launch', launch, 'desde', d_from, 'hasta', d_to, 'hoy', hoy, 'generado', now(),
    'no_cuentan', no_cuentan,
    'resumen', resumen,
    'por_dia', coalesce(por_dia, '[]'::jsonb),
    'versiones', coalesce(versiones, '[]'::jsonb),
    'ganador', ganador,
    'fuentes', coalesce(fuentes, '[]'::jsonb),
    'respuestas_pauta', jsonb_build_object('inversion', coalesce(inversion, '[]'::jsonb), 'paises', coalesce(paises, '[]'::jsonb)),
    'embudo', jsonb_build_object('pasos', embudo, 'estados', coalesce(estados, '[]'::jsonb), 'stages', coalesce(stages, '[]'::jsonb), 'intentos', coalesce(intentos, '[]'::jsonb)),
    'ventas', jsonb_build_object('por_programa', coalesce(ventas, '[]'::jsonb), 'vencidas', vencidas, 'proximas_7_dias', proximas)
  );
end;
$$;

revoke all on function public.crm_ads_metrics(text, date, date) from public, anon;
grant execute on function public.crm_ads_metrics(text, date, date) to authenticated, service_role;
revoke all on function private.ads_leads(text, date, date) from public, anon, authenticated;
revoke all on function private.ads_summary(jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.phone_country(text) from public, anon, authenticated;
revoke all on function private.pct(numeric, numeric) from public, anon, authenticated;
