-- =====================================================================
-- Versiones que salen de un test antes de que termine.
-- landing_test_variants.retired_at: desde cuándo la versión ya no se muestra (null = sigue).
-- El test del 12/11 queda solo con a2 y a3 desde las 15:35: se marcan las otras 7 y se
-- carga el evento. crm_landing_tests devuelve «retirada» en cada versión (el resto no cambia).
-- =====================================================================

alter table public.landing_test_variants add column retired_at timestamptz;
comment on column public.landing_test_variants.retired_at is 'Desde cuándo la versión salió del test (null = sigue activa).';

update public.landing_test_variants set retired_at = '2026-11-12 15:35-03'
where test_id = 'titular-orden-12-11' and code not in ('a2', 'a3');

insert into public.landing_test_events (test_id, at, until, descripcion, variants)
values ('titular-orden-12-11', '2026-11-12 15:35-03', null, 'El test queda solo con a2 y a3 (salen las otras 7 versiones)', null);

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
        -- Un código no puede aparecer antes de que arranque el primer test que lo usa.
        greatest(lv.day::timestamp at time zone tz, (
          select min(t.starts_at) from public.landing_test_variants v join public.landing_tests t on t.id = v.test_id
          where v.code = nullif(lv.variant, ''))) i_start,
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
      count(*) filter (where o.califica) calificados, count(*) filter (where o.califica and o.pauta) calificados_pauta,
      count(*) filter (where o.grupo) grupo,
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
      'orden_key', v.orden_key, 'orden', v.orden, 'sort', v.sort, 'retirada', v.retired_at,
      'visitas', coalesce(vv.visitas, 0), 'visitas_pauta', coalesce(vv.visitas_pauta, 0), 'visitas_estimadas', coalesce(vv.estimado, false),
      'rezagados_visitas', coalesce(vv.rez, 0),
      'registros', coalesce(oo.registros, 0), 'registros_pauta', coalesce(oo.registros_pauta, 0),
      'calificados', coalesce(oo.calificados, 0), 'calificados_pauta', coalesce(oo.calificados_pauta, 0),
      'grupo', coalesce(oo.grupo, 0), 'rezagados_registros', coalesce(oo.rez, 0),
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

