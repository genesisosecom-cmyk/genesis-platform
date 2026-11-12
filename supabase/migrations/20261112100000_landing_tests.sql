-- =====================================================================
-- Tests de landing: historial y seguimiento versión por versión.
--
-- landing_tests          un test (o un grupo de landings sueltas, tipo 'landing') con su ventana
-- landing_test_variants  sus versiones: código tracking.ab + nombre, titular, bajada y orden
-- landing_test_events    cambios hechos durante el test (se marcan en los gráficos)
-- landing_visit_log      cada visita con su hora, UTM y ad_id (desde esta migración)
--
-- El mismo código puede usarse en varios tests (1/2/3): cada visita o registro va al test que
-- tenía ese código activo en su fecha y hora. Si llega después de que el test terminó y ningún
-- otro lo usa, es un «rezagado» (página en caché) y se cuenta en ese test. Si ningún test
-- usa el código, va a «sin test».
-- La landing no cambia: ingest_visita recibe y responde lo mismo, solo guarda además el detalle.
-- =====================================================================

create table public.landing_tests (
  id text primary key,
  nombre text not null,
  descripcion text not null default '',
  tipo text not null default 'test' check (tipo in ('test', 'landing')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  stable_from timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
comment on column public.landing_tests.stable_from is 'Desde cuándo la página quedó estable: las vistas toman los datos desde acá por defecto.';

create table public.landing_test_variants (
  test_id text not null references public.landing_tests (id) on delete cascade,
  code text not null check (code = trim(code) and code <> ''),
  nombre text not null,
  titular_key text not null default '',
  titular text not null default '',
  bajada text not null default '',
  orden_key text not null default '',
  orden text not null default '',
  sort int not null default 0,
  primary key (test_id, code)
);
create index landing_test_variants_code_idx on public.landing_test_variants (code);

create table public.landing_test_events (
  id uuid primary key default gen_random_uuid(),
  test_id text not null references public.landing_tests (id) on delete cascade,
  at timestamptz not null,
  until timestamptz,
  descripcion text not null,
  variants text[],  -- null = todas las versiones
  created_at timestamptz not null default now()
);
create index landing_test_events_test_idx on public.landing_test_events (test_id, at);

create table public.landing_visit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  launch_id text,
  source text not null,
  variant text not null default '',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  ad_id text
);
create index landing_visit_log_at_idx on public.landing_visit_log (at);
create index landing_visit_log_variant_idx on public.landing_visit_log (variant, at);

-- Desde cuándo hay visitas con hora (antes, solo el total por día de landing_visits).
create table public.landing_visit_log_meta (
  id boolean primary key default true check (id),
  since timestamptz not null default now()
);
insert into public.landing_visit_log_meta (id) values (true);

alter table public.landing_tests enable row level security;
alter table public.landing_test_variants enable row level security;
alter table public.landing_test_events enable row level security;
alter table public.landing_visit_log enable row level security;
alter table public.landing_visit_log_meta enable row level security;
create policy "landing_tests: solo admin" on public.landing_tests
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "landing_test_variants: solo admin" on public.landing_test_variants
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "landing_test_events: solo admin" on public.landing_test_events
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
-- landing_visit_log y su meta: sin políticas (solo las funciones).
revoke all on public.landing_visit_log, public.landing_visit_log_meta from anon, authenticated;
revoke all on public.landing_tests, public.landing_test_variants, public.landing_test_events from anon;

-- ---------- Tests cargados ----------

insert into public.landing_tests (id, nombre, descripcion, tipo, starts_at, ends_at, stable_from) values
  ('titular-14-10', 'Titular A/B (14/10)', 'Test de titular. Sin datos en el campus: el campus registra desde el 31/10. Faltan los textos de los titulares.', 'test',
    '2026-10-14 00:00-03', '2026-10-16 00:00-03', null),
  ('orden-16-10', 'Orden 1/2/3 (16/10)', 'Mismo titular, cambia el orden de video y registro. Los datos del campus arrancan el 31/10.', 'test',
    '2026-10-16 00:00-03', '2026-11-10 01:40-03', null),
  ('titular-orden-10-11', 'Titular + orden (10/11)', 'Cada versión con su titular y su orden.', 'test',
    '2026-11-10 01:40-03', '2026-11-10 16:02-03', null),
  ('orden-10-11', 'Orden 1/2/3 (10/11 tarde)', 'Vuelve el titular del 16/10, ahora con la cifra +$270M. Cambia el orden.', 'test',
    '2026-11-10 16:02-03', '2026-11-12 02:24-03', null),
  ('titular-orden-12-11', 'Titular × orden (12/11)', '3 titulares × 3 órdenes. El link /clase reparte en partes iguales entre las 9; cada una tiene su link fijo (/a1 … /c3).', 'test',
    '2026-11-12 02:24-03', null, '2026-11-12 04:01-03'),
  ('landings-dolor', 'Landings por dolor', 'Landings sueltas por dolor, con su titular y el orden 1. No son un test. Fecha de inicio aproximada.', 'landing',
    '2026-10-14 00:00-03', null, null);

insert into public.landing_test_variants (test_id, code, nombre, titular_key, titular, bajada, orden_key, orden, sort) values
  ('titular-14-10', 'A', 'Titular A', 'A', '', '', '', '', 1),
  ('titular-14-10', 'B', 'Titular B', 'B', '', '', '', '', 2),
  ('orden-16-10', '1', 'Orden 1 · video y registro abajo', '', 'Cómo un ecommerce hizo +$220M con +40% de margen…', '', '1', 'Video y registro abajo', 1),
  ('orden-16-10', '2', 'Orden 2 · registro arriba del video', '', 'Cómo un ecommerce hizo +$220M con +40% de margen…', '', '2', 'Registro arriba del video', 2),
  ('orden-16-10', '3', 'Orden 3 · registro sin video', '', 'Cómo un ecommerce hizo +$220M con +40% de margen…', '', '3', 'Registro sin video', 3),
  ('titular-orden-10-11', '1', 'Versión 1 · escalar con suscripciones', '1', 'Vas a ver cómo escalar tu ecommerce a +$100M/mes con el modelo de suscripciones sin depender del CPA ni de Meta', '', '1', 'Video y registro abajo', 1),
  ('titular-orden-10-11', '2', 'Versión 2 · clientes que compran todos los meses', '2', 'Vas a ver cómo llevar tu ecommerce a +$100M/mes con clientes que te compran todos los meses, sin depender del CPA ni de Meta', '', '2', 'Registro arriba del video', 2),
  ('titular-orden-10-11', '3', 'Versión 3 · pagar más por cada cliente', '3', 'Vas a ver cómo escalar tu ecommerce a +$100M/mes pudiendo pagar más que tu competencia por cada cliente, sin depender del CPA ni de Meta', '', '3', 'Registro sin video', 3),
  ('orden-10-11', '1', 'Orden 1 · video y registro abajo', '', 'Cómo un ecommerce hizo +$270M con +40% de margen…', '', '1', 'Video y registro abajo', 1),
  ('orden-10-11', '2', 'Orden 2 · registro arriba del video', '', 'Cómo un ecommerce hizo +$270M con +40% de margen…', '', '2', 'Registro arriba del video', 2),
  ('orden-10-11', '3', 'Orden 3 · registro sin video', '', 'Cómo un ecommerce hizo +$270M con +40% de margen…', '', '3', 'Registro sin video', 3),
  ('landings-dolor', 'cpa', 'Dolor · CPA', 'cpa', 'Cómo pagar 2,5 veces más por cada cliente que tu competencia y seguir siendo rentable', '', '1', 'Titular + video + registro', 1),
  ('landings-dolor', 'margen', 'Dolor · Margen', 'margen', 'Cómo hacer que la segunda, la tercera y la cuarta compra entren con el margen entero', '', '1', 'Titular + video + registro', 2),
  ('landings-dolor', 'meta', 'Dolor · Meta', 'meta', 'Cómo hacer que tu marca arranque el mes ya cobrada, sin depender de Meta', '', '1', 'Titular + video + registro', 3);

insert into public.landing_test_variants (test_id, code, nombre, titular_key, titular, bajada, orden_key, orden, sort)
select 'titular-orden-12-11', t.k || o.k, 'Titular ' || upper(t.k) || ' · orden ' || o.k || ' (' || o.corto || ')', t.k, t.titular, t.bajada, o.k, o.orden,
  (t.n - 1) * 3 + o.n
from (values
  ('a', 1, 'Copia mi modelo de suscripciones con el que pasé de 60M/mes a +270M/mes',
   'Te voy a dar TODO lo que necesitás para llegar a +40% de margen sin depender del CPA ni de Meta, en vivo y gratis.'),
  ('b', 2, 'Copia y Pega el Modelo de Suscripciones que Uso En Mi Marca Para Hacer $270M/Mes · Con 40% De Margen…',
   'Te voy a dar TODO lo que necesitás para transformar tu ecommerce de compra única a ECOMMERCE DE SUSCRIPCIONES de +$100M (sin depender del CPA ni de META).'),
  ('c', 3, 'Te voy a regalar el secreto de cómo hago +270M/mes en mi ecommerce y +40% de margen únicamente con el modelo de suscripción',
   'Te voy a dar TODO lo que necesitás para transformar tu ecommerce de compra única a ECOMMERCE DE SUSCRIPCIONES de +$100M (sin depender del CPA ni de META).')
) t(k, n, titular, bajada)
cross join (values
  ('1', 1, 'Titular + video + registro', 'video arriba'),
  ('2', 2, 'Titular + registro + video', 'registro arriba'),
  ('3', 3, 'Titular + registro (sin video)', 'sin video')
) o(k, n, orden, corto);

insert into public.landing_test_events (test_id, at, until, descripcion, variants) values
  ('titular-orden-12-11', '2026-11-12 02:31-03', null, 'Se sacan las etiquetas «Roadmaps / Procesos / Agentes de IA» debajo del titular', null),
  ('titular-orden-12-11', '2026-11-12 02:39-03', '2026-11-12 02:42-03', 'Bajada nueva en las versiones a (la final queda desde las 02:42)', array['a1', 'a2', 'a3']),
  ('titular-orden-12-11', '2026-11-12 03:03-03', null, 'Landing y thank you pasan a modo claro', null),
  ('titular-orden-12-11', '2026-11-12 03:18-03', null, 'En las b, «Con 40% De Margen…» pasa a una segunda línea más chica', array['b1', 'b2', 'b3']),
  ('titular-orden-12-11', '2026-11-12 03:38-03', null, 'Bajada en gris parejo, sin resaltados', null),
  ('titular-orden-12-11', '2026-11-12 03:50-03', null, 'Vuelven las secciones «Todo lo que incluye la Clase Privada» y testimonios', null),
  ('titular-orden-12-11', '2026-11-12 04:01-03', null, 'Se saca la sección «Lo que vas a ver en vivo» (desde acá la página queda estable)', null);

-- ---------- A qué test va un código en un momento ----------

create or replace function private.landing_test_for(p_code text, p_at timestamptz)
returns text language sql stable set search_path = '' as $$
  -- El test que tenía ese código activo; si ninguno, el último que lo usó y ya terminó (rezagado).
  select t.id
  from public.landing_test_variants v join public.landing_tests t on t.id = v.test_id
  where v.code = nullif(trim(p_code), '') and t.starts_at <= p_at
  order by (t.ends_at is null or p_at < t.ends_at) desc, t.starts_at desc
  limit 1;
$$;

-- ---------- ingest_visita: además guarda el detalle (sin cambiar lo que recibe ni responde) ----------

create or replace function public.ingest_visita(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  t jsonb := case when jsonb_typeof(p -> 'tracking') = 'object' then p -> 'tracking' else '{}'::jsonb end;
  launch text := private.current_launch();
  fuente text := private.lead_source(t);
  version text := coalesce(t ->> 'ab', '');
begin
  insert into public.landing_visits as lv (launch_id, day, source, variant, visits)
  values (launch, (now() at time zone 'America/Argentina/Buenos_Aires')::date, fuente, version, 1)
  on conflict (launch_id, day, source, variant) do update set visits = lv.visits + 1;

  -- El detalle nunca puede frenar el conteo de la visita.
  begin
    insert into public.landing_visit_log (launch_id, source, variant, utm_source, utm_medium, utm_campaign, utm_content, utm_term, ad_id)
    values (launch, fuente, version,
      nullif(left(t ->> 'utm_source', 200), ''), nullif(left(t ->> 'utm_medium', 200), ''), nullif(left(t ->> 'utm_campaign', 300), ''),
      nullif(left(t ->> 'utm_content', 300), ''), nullif(left(t ->> 'utm_term', 300), ''), nullif(left(t ->> 'ad_id', 50), ''));
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true);
end;
$function$;

-- ---------- Números de los tests (solo admin) ----------
-- p_from/p_to: días de Argentina (null = sin límite). p_fuente: 'todas' | 'pauta' | 'organico'.
-- p_utm_campaign / p_utm_content / p_ad_id: con alguno de estos, las visitas solo salen del
-- registro con hora (las anteriores no tienen UTM). p_estable: desde que la página quedó estable.
create or replace function public.crm_landing_tests(
  p_from date default null,
  p_to date default null,
  p_fuente text default 'todas',
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_ad_id text default null,
  p_estable boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz constant text := 'America/Argentina/Buenos_Aires';
  from_ts timestamptz := case when p_from is null then '-infinity'::timestamptz else p_from::timestamp at time zone 'America/Argentina/Buenos_Aires' end;
  to_ts timestamptz := case when p_to is null then 'infinity'::timestamptz else (p_to + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires' end;
  log_since timestamptz := (select since from public.landing_visit_log_meta);
  log_day date := (log_since at time zone 'America/Argentina/Buenos_Aires')::date;
  detalle boolean := coalesce(p_utm_campaign, p_utm_content, p_ad_id) is not null;
  fuente text := coalesce(nullif(p_fuente, ''), 'todas');
  res jsonb;
begin
  if not private.is_superadmin() then
    raise exception 'Sin permisos';
  end if;
  if fuente not in ('todas', 'pauta', 'organico') then
    raise exception 'Fuente inválida: %', p_fuente;
  end if;

  create temp table if not exists _lt_v (
    code text, test_id text, at timestamptz, dia date, visitas numeric, pauta boolean, estimado boolean, exacto boolean, ad_id text
  ) on commit drop;
  truncate _lt_v;
  create temp table if not exists _lt_o (
    code text, test_id text, at timestamptz, dia date, pauta boolean, califica boolean, grupo boolean
  ) on commit drop;
  truncate _lt_o;

  -- Visitas con hora (desde log_since): una por una.
  insert into _lt_v
  select g.variant, private.landing_test_for(g.variant, g.at), g.at, (g.at at time zone tz)::date, 1,
    g.source = 'Anuncios de Meta', false, true, g.ad_id
  from public.landing_visit_log g
  where g.source <> 'Test' and g.at >= from_ts and g.at < to_ts
    and (fuente = 'todas' or (fuente = 'pauta') = (g.source = 'Anuncios de Meta'))
    and (p_utm_campaign is null or g.utm_campaign = p_utm_campaign)
    and (p_utm_content is null or g.utm_content = p_utm_content)
    and (p_ad_id is null or g.ad_id = p_ad_id);

  -- Visitas anteriores (total por día): se corta cada día en los inicios/fines de los tests que
  -- usan ese código y se reparte según las horas (estimado). El día en que arranca el registro
  -- con hora solo se toma la parte de antes, descontando lo que ya está en el registro.
  if not detalle then
    with r as (
      select lv.variant code, lv.source, lv.day,
        lv.day::timestamp at time zone tz i_start,
        case when lv.day = log_day then log_since else (lv.day + 1)::timestamp at time zone tz end i_end,
        (lv.visits - case when lv.day = log_day then (
            select count(*) from public.landing_visit_log g
            where g.variant = lv.variant and g.source = lv.source and g.launch_id = lv.launch_id
              and (g.at at time zone tz)::date = lv.day)
          else 0 end)::numeric visitas
      from public.landing_visits lv
      where lv.source <> 'Test' and lv.day <= log_day
        and (fuente = 'todas' or (fuente = 'pauta') = (lv.source = 'Anuncios de Meta'))
    ),
    r2 as (select row_number() over () rid, r.* from r where r.visitas > 0 and r.i_end > r.i_start),
    b as (
      select distinct r2.rid, bb.x
      from r2 cross join lateral (
        select unnest(array[r2.i_start, r2.i_end, from_ts, to_ts]) x
        union all
        select unnest(array[t.starts_at, t.ends_at, t.stable_from])
        from public.landing_test_variants v join public.landing_tests t on t.id = v.test_id
        where v.code = nullif(r2.code, '')
      ) bb
      where bb.x is not null and bb.x >= r2.i_start and bb.x <= r2.i_end
    ),
    s as (select b.rid, b.x s_start, lead(b.x) over (partition by b.rid order by b.x) s_end from b)
    insert into _lt_v
    select r2.code, private.landing_test_for(r2.code, s.s_start), s.s_start, r2.day,
      r2.visitas * extract(epoch from s.s_end - s.s_start) / extract(epoch from r2.i_end - r2.i_start),
      r2.source = 'Anuncios de Meta',
      (s.s_end - s.s_start) < (r2.i_end - r2.i_start),
      false, null
    from r2 join s on s.rid = r2.rid
    where s.s_end is not null and s.s_end > s.s_start and s.s_start >= from_ts and s.s_end <= to_ts;
  end if;

  -- Registros: siempre con su hora exacta.
  insert into _lt_o
  select x.code, private.landing_test_for(x.code, x.optin_at), x.optin_at, (x.optin_at at time zone tz)::date,
    x.source = 'Anuncios de Meta', coalesce(x.califica, false), coalesce(x.toco_grupo, false)
  from (
    select coalesce(nullif(ll.variant, ''), nullif(ll.tracking ->> 'ab', ''), '') code, ll.optin_at, ll.source, ll.califica, ll.toco_grupo, ll.tracking
    from public.lead_launches ll
    where ll.optin_at is not null and ll.no_cuenta_reason is null
      and ll.optin_at >= from_ts and ll.optin_at < to_ts
  ) x
  where (fuente = 'todas' or (fuente = 'pauta') = (x.source = 'Anuncios de Meta'))
    and (p_utm_campaign is null or x.tracking ->> 'utm_campaign' = p_utm_campaign)
    and (p_utm_content is null or x.tracking ->> 'utm_content' = p_utm_content)
    and (p_ad_id is null or x.tracking ->> 'ad_id' = p_ad_id);

  -- Desde que la página quedó estable (si el test lo indica).
  if p_estable then
    delete from _lt_v v using public.landing_tests t where t.id = v.test_id and t.stable_from is not null and v.at < t.stable_from;
    delete from _lt_o o using public.landing_tests t where t.id = o.test_id and t.stable_from is not null and o.at < t.stable_from;
  end if;

  with
  vv as (
    select v.test_id, v.code,
      round(sum(v.visitas), 1) visitas,
      round(sum(v.visitas) filter (where v.pauta), 1) visitas_pauta,
      bool_or(v.estimado) estimado,
      round(coalesce(sum(v.visitas) filter (where t.ends_at is not null and v.at >= t.ends_at), 0), 1) rez
    from _lt_v v join public.landing_tests t on t.id = v.test_id
    group by 1, 2
  ),
  oo as (
    select o.test_id, o.code, count(*) registros, count(*) filter (where o.pauta) registros_pauta,
      count(*) filter (where o.califica) calificados, count(*) filter (where o.grupo) grupo,
      count(*) filter (where t.ends_at is not null and o.at >= t.ends_at) rez
    from _lt_o o join public.landing_tests t on t.id = o.test_id
    group by 1, 2
  ),
  dias as (
    select test_id, code, dia,
      round(sum(visitas), 1) v, round(sum(visitas) filter (where pauta), 1) vp, 0::bigint r, 0::bigint c, 0::bigint g
    from _lt_v where test_id is not null group by 1, 2, 3
    union all
    select test_id, code, dia, 0, 0, count(*), count(*) filter (where califica), count(*) filter (where grupo)
    from _lt_o where test_id is not null group by 1, 2, 3
  ),
  serie as (
    select test_id, code, jsonb_agg(jsonb_build_object('dia', dia, 'visitas', v, 'visitas_pauta', vp, 'registros', r, 'calificados', c, 'grupo', g) order by dia) s
    from (select test_id, code, dia, sum(v) v, sum(vp) vp, sum(r) r, sum(c) c, sum(g) g from dias group by 1, 2, 3) d
    group by 1, 2
  ),
  -- Por hora: solo tests abiertos y visitas con hora.
  horas_src as (
    select v.test_id, v.code, date_trunc('hour', v.at at time zone tz) h, sum(v.visitas) v, 0::bigint r
    from _lt_v v join public.landing_tests t on t.id = v.test_id
    where v.exacto and t.ends_at is null group by 1, 2, 3
    union all
    select o.test_id, o.code, date_trunc('hour', o.at at time zone tz), 0, count(*)
    from _lt_o o join public.landing_tests t on t.id = o.test_id
    where t.ends_at is null and o.at >= log_since group by 1, 2, 3
  ),
  horas as (
    select test_id, code, jsonb_agg(jsonb_build_object('hora', h, 'visitas', v, 'registros', r) order by h) s
    from (select test_id, code, h, sum(v) v, sum(r) r from horas_src group by 1, 2, 3) x
    group by 1, 2
  ),
  versiones as (
    select v.test_id, jsonb_agg(jsonb_build_object(
      'code', v.code, 'nombre', v.nombre, 'titular_key', v.titular_key, 'titular', v.titular, 'bajada', v.bajada,
      'orden_key', v.orden_key, 'orden', v.orden, 'sort', v.sort,
      'visitas', coalesce(vv.visitas, 0), 'visitas_pauta', coalesce(vv.visitas_pauta, 0), 'visitas_estimadas', coalesce(vv.estimado, false),
      'rezagados_visitas', coalesce(vv.rez, 0),
      'registros', coalesce(oo.registros, 0), 'registros_pauta', coalesce(oo.registros_pauta, 0),
      'calificados', coalesce(oo.calificados, 0), 'grupo', coalesce(oo.grupo, 0), 'rezagados_registros', coalesce(oo.rez, 0),
      'serie', coalesce(serie.s, '[]'::jsonb), 'horas', coalesce(horas.s, '[]'::jsonb)
    ) order by v.sort, v.code) j
    from public.landing_test_variants v
    left join vv on vv.test_id = v.test_id and vv.code = v.code
    left join oo on oo.test_id = v.test_id and oo.code = v.code
    left join serie on serie.test_id = v.test_id and serie.code = v.code
    left join horas on horas.test_id = v.test_id and horas.code = v.code
    group by v.test_id
  ),
  eventos as (
    select e.test_id, jsonb_agg(jsonb_build_object('at', e.at, 'until', e.until, 'descripcion', e.descripcion, 'variants', e.variants) order by e.at) j
    from public.landing_test_events e group by 1
  ),
  sin_test as (
    select code, round(sum(visitas), 1) visitas, sum(registros) registros
    from (
      select code, visitas, 0 registros from _lt_v where test_id is null
      union all
      select code, 0, 1 from _lt_o where test_id is null
    ) x group by 1
  )
  select jsonb_build_object(
    'desde', p_from, 'hasta', p_to, 'fuente', fuente, 'estable', p_estable, 'generado', now(),
    'log_desde', log_since, 'solo_visitas_con_hora', detalle,
    'tests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'nombre', t.nombre, 'descripcion', t.descripcion, 'tipo', t.tipo,
        'inicio', t.starts_at, 'fin', t.ends_at, 'estable_desde', t.stable_from,
        'datos_desde', (select min(at) from (select at from _lt_v where test_id = t.id union all select at from _lt_o where test_id = t.id) d),
        'eventos', coalesce(eventos.j, '[]'::jsonb),
        'versiones', coalesce(versiones.j, '[]'::jsonb)
      ) order by t.starts_at desc)
      from public.landing_tests t
      left join versiones on versiones.test_id = t.id
      left join eventos on eventos.test_id = t.id
    ), '[]'::jsonb),
    'sin_test', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'visitas', visitas, 'registros', registros) order by visitas desc) from sin_test), '[]'::jsonb),
    'pauta_por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', day, 'visitas', n) order by day)
      from (select day, sum(visits) n from public.landing_visits
            where source = 'Anuncios de Meta' and day::timestamp at time zone tz >= from_ts and day::timestamp at time zone tz < to_ts
            group by 1) p
    ), '[]'::jsonb),
    'anuncios_version', coalesce((
      select jsonb_agg(jsonb_build_object('ad_id', ad_id, 'code', code, 'test_id', test_id, 'visitas', n))
      from (select v.ad_id, v.code, v.test_id, sum(v.visitas) n from _lt_v v join public.landing_tests t on t.id = v.test_id
            where v.exacto and v.ad_id is not null and t.ends_at is null group by 1, 2, 3) a
    ), '[]'::jsonb),
    'opciones', jsonb_build_object(
      'campanas', coalesce((select jsonb_agg(c order by c) from (
          select utm_campaign c from public.landing_visit_log where utm_campaign is not null and at >= from_ts and at < to_ts
          union select tracking ->> 'utm_campaign' from public.lead_launches where tracking ->> 'utm_campaign' is not null and optin_at >= from_ts and optin_at < to_ts) x), '[]'::jsonb),
      'contenidos', coalesce((select jsonb_agg(c order by c) from (
          select utm_content c from public.landing_visit_log where utm_content is not null and at >= from_ts and at < to_ts
          union select tracking ->> 'utm_content' from public.lead_launches where tracking ->> 'utm_content' is not null and optin_at >= from_ts and optin_at < to_ts) x), '[]'::jsonb),
      'anuncios', coalesce((select jsonb_agg(c order by c) from (
          select ad_id c from public.landing_visit_log where ad_id is not null and at >= from_ts and at < to_ts
          union select tracking ->> 'ad_id' from public.lead_launches where tracking ->> 'ad_id' is not null and optin_at >= from_ts and optin_at < to_ts) x), '[]'::jsonb)
    )
  ) into res;
  return res;
end;
$$;

revoke all on function public.crm_landing_tests(date, date, text, text, text, text, boolean) from public, anon;
grant execute on function public.crm_landing_tests(date, date, text, text, text, text, boolean) to authenticated, service_role;
revoke all on function private.landing_test_for(text, timestamptz) from public, anon, authenticated;
