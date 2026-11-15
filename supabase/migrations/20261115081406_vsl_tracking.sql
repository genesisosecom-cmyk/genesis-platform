-- =====================================================================
-- Seguimiento del VSL de la landing de registro (vTurb / ConverteAI).
--
-- vsl_players     los VSL que pasaron por la landing: player, video, nombre y período (desde/hasta).
--                 El próximo cambio de VSL es agregar una fila acá (y cerrar la anterior).
-- vsl_daily       métricas de vTurb por player y por día (hora Argentina), las trae la función
--                 programada vturb-sync una vez por hora. Nunca se piden en cada carga del tablero.
-- vsl_sync_runs   cada corrida de vturb-sync (para ver en el tablero si está andando).
--
-- No cambia nada de cómo se guardan visitas, registros, grupo ni aplicaciones.
-- El token de vTurb es un secreto de la función (VTURB_API_TOKEN), no está en la base.
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- Qué versiones de la landing cargan video (las «3» y d3 no). Sirve para el play rate.
alter table public.landing_test_variants add column if not exists con_video boolean not null default true;
update public.landing_test_variants set con_video = false where orden_key in ('3', 'sin-video');
comment on column public.landing_test_variants.con_video is 'La versión carga el VSL. El play rate usa las visitas de las versiones con video.';

create table public.vsl_players (
  player_id text primary key check (player_id ~ '^[0-9a-f]{24}$'),
  video_id text not null default '',
  nombre text not null,
  desde timestamptz,
  hasta timestamptz,
  desde_fuente text not null default 'manual' check (desde_fuente in ('manual', 'merge', 'primer_play')),
  duracion_seg int,
  pitch_seg int,
  sort int not null default 0,
  -- Control: reproducciones del player después de «hasta» (si hay, alguna página tiene el player viejo).
  plays_despues int,
  plays_despues_at timestamptz,
  sincronizado_at timestamptz,
  created_at timestamptz not null default now(),
  check (hasta is null or desde is null or hasta > desde)
);
comment on table public.vsl_players is 'VSL de la landing de registro: un player de vTurb por período. Cambiar de VSL = cerrar la fila anterior (hasta) y agregar una nueva.';
comment on column public.vsl_players.desde_fuente is 'manual = cargada a mano · merge = hora en que se publicó la landing · primer_play = primer play del player en vTurb después de esa hora.';
comment on column public.vsl_players.duracion_seg is 'Duración del video según vTurb (players/list).';
comment on column public.vsl_players.pitch_seg is 'Segundo del pitch configurado en vTurb (0 = sin configurar).';

create table public.vsl_daily (
  player_id text not null references public.vsl_players (player_id) on delete cascade,
  dia date not null,
  plays int not null default 0,
  plays_unicos int not null default 0,
  vistas int not null default 0,
  vistas_unicas int not null default 0,
  terminaron int not null default 0,
  clicks int not null default 0,
  sobre_pitch int not null default 0,
  bajo_pitch int not null default 0,
  conversiones int not null default 0,
  play_rate_vturb numeric,
  engagement_vturb numeric,
  promedio_visto_seg numeric,
  curva jsonb,
  raw jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (player_id, dia)
);
comment on table public.vsl_daily is 'Métricas de vTurb por player y por día de Argentina (sessions/stats_by_day + times/user_engagement).';
comment on column public.vsl_daily.plays is 'total_started de vTurb (reproducciones).';
comment on column public.vsl_daily.vistas is 'total_viewed de vTurb (cargas del player).';
comment on column public.vsl_daily.curva is 'grouped_timed de times/user_engagement: [[segundo, usuarios], ...].';

create table public.vsl_sync_runs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  ok boolean not null,
  detalle text not null default '',
  llamadas int not null default 0
);
create index vsl_sync_runs_at_idx on public.vsl_sync_runs (at desc);

alter table public.vsl_players enable row level security;
alter table public.vsl_daily enable row level security;
alter table public.vsl_sync_runs enable row level security;
create policy "vsl_players: solo admin" on public.vsl_players
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "vsl_daily: solo admin lee" on public.vsl_daily
  for select to authenticated using ((select private.is_superadmin()));
create policy "vsl_sync_runs: solo admin lee" on public.vsl_sync_runs
  for select to authenticated using ((select private.is_superadmin()));
revoke all on public.vsl_players, public.vsl_daily, public.vsl_sync_runs from anon;
revoke insert, update, delete on public.vsl_daily, public.vsl_sync_runs from authenticated;

-- ---------- Los tres VSL ----------
-- Horas = cuando se mergeó cada cambio de la landing (hora Argentina). La de PRIME la ajusta
-- vturb-sync al primer play del player en vTurb (si vTurb da la hora).
insert into public.vsl_players (player_id, video_id, nombre, desde, hasta, desde_fuente, sort) values
  ('6af0436bd779234bdaf8cdf5', '6af0432aa315ca7972372bd5', 'VSL v1 (19/10)', '2026-10-19 00:00-03', '2026-11-14 02:42-03', 'manual', 1),
  ('6af7f23efe9c64e8f3d1c34c', '6af7f22ed3d9169508d17088', 'VSL v2', '2026-11-14 02:42-03', '2026-11-15 04:59-03', 'merge', 2),
  ('6af964c8c9d7117ea1c58a33', '6af96413504e9e302adeefc2', 'VSL PRIME', '2026-11-15 04:59-03', null, 'merge', 3);

-- ---------- Clave de la corrida programada ----------
-- pg_cron llama a la función con esta clave; la función la valida con vsl_sync_auth().
create table private.vsl_cron_key (
  id boolean primary key default true check (id),
  key text not null default encode(extensions.gen_random_bytes(24), 'hex')
);
insert into private.vsl_cron_key (id) values (true);
revoke all on private.vsl_cron_key from public, anon, authenticated;

create or replace function public.vsl_sync_auth(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_key, '') <> '' and p_key = (select key from private.vsl_cron_key);
$$;
revoke all on function public.vsl_sync_auth(text) from public, anon, authenticated;
grant execute on function public.vsl_sync_auth(text) to service_role;

-- Primer play encontrado en vTurb: mueve el inicio del player y el fin del anterior.
-- Solo si la hora vino del merge (una fecha cargada a mano no se toca) y cae dentro de las
-- 24 horas siguientes a esa hora.
create or replace function public.vsl_set_primer_play(p_player text, p_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  cur public.vsl_players;
begin
  select * into cur from public.vsl_players where player_id = p_player for update;
  if not found or cur.desde_fuente <> 'merge' or cur.desde is null then return false; end if;
  if p_at < cur.desde or p_at > cur.desde + interval '24 hours' then return false; end if;
  update public.vsl_players set hasta = p_at where hasta = cur.desde and player_id <> p_player;
  update public.vsl_players set desde = p_at, desde_fuente = 'primer_play' where player_id = p_player;
  return true;
end;
$$;
revoke all on function public.vsl_set_primer_play(text, timestamptz) from public, anon, authenticated;
grant execute on function public.vsl_set_primer_play(text, timestamptz) to service_role;

-- ---------- Números del VSL cruzados con la landing (solo admin) ----------
-- Por player y por día: lo de vTurb + visitas de las versiones con video y d1/d3 (visitas,
-- registros, calificados, grupo) dentro del período del player. Cada día se corta en el
-- desde/hasta del player, así nunca se mezclan dos VSL.
-- Antes del registro con hora (landing_visit_log) las visitas son el total del día (estimado).
create or replace function public.crm_vsl(p_fuente text default 'todas')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz constant text := 'America/Argentina/Buenos_Aires';
  log_since timestamptz := (select since from public.landing_visit_log_meta);
  log_day date := (log_since at time zone 'America/Argentina/Buenos_Aires')::date;
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  fuente text := coalesce(nullif(p_fuente, ''), 'todas');
  res jsonb;
begin
  if not private.is_superadmin() then
    raise exception 'Sin permisos';
  end if;
  if fuente not in ('todas', 'pauta', 'organico') then
    raise exception 'Fuente inválida: %', p_fuente;
  end if;

  with
  con_video as (select code from public.landing_test_variants group by code having bool_and(con_video)),
  dias as (
    select p.player_id, d::date dia,
      greatest(d::timestamp at time zone tz, coalesce(p.desde, '-infinity'::timestamptz)) w_ini,
      least((d::date + 1)::timestamp at time zone tz, coalesce(p.hasta, 'infinity'::timestamptz), now()) w_fin
    from public.vsl_players p
    cross join lateral generate_series(
      coalesce((p.desde at time zone tz)::date, (select min(x.dia) from public.vsl_daily x where x.player_id = p.player_id), hoy)::timestamp,
      greatest(
        coalesce((least(coalesce(p.hasta, now()), now()) at time zone tz)::date, hoy),
        coalesce((select max(x.dia) from public.vsl_daily x where x.player_id = p.player_id), '-infinity'::date)
      )::timestamp,
      interval '1 day') d
  ),
  -- Visitas con hora, cortadas en el período del player.
  vis_log as (
    select di.player_id, di.dia,
      count(*) filter (where g.variant in (select code from con_video)) con_video,
      count(*) filter (where g.variant = 'd1') d1,
      count(*) filter (where g.variant = 'd3') d3
    from dias di
    join public.landing_visit_log g on g.at >= di.w_ini and g.at < di.w_fin
    where di.w_fin > di.w_ini and di.dia >= log_day and g.source <> 'Test'
      and (fuente = 'todas' or (fuente = 'pauta') = (g.source = 'Anuncios de Meta'))
    group by 1, 2
  ),
  -- Días anteriores al registro con hora: total del día.
  vis_old as (
    select di.player_id, di.dia,
      sum(lv.visits) filter (where lv.variant in (select code from con_video)) con_video,
      sum(lv.visits) filter (where lv.variant = 'd1') d1,
      sum(lv.visits) filter (where lv.variant = 'd3') d3
    from dias di
    join public.landing_visits lv on lv.day = di.dia
    where di.w_fin > di.w_ini and di.dia < log_day and lv.source <> 'Test'
      and (fuente = 'todas' or (fuente = 'pauta') = (lv.source = 'Anuncios de Meta'))
    group by 1, 2
  ),
  reg as (
    select di.player_id, di.dia, x.code,
      count(*) registros, count(*) filter (where x.califica) calificados, count(*) filter (where x.grupo) grupo
    from dias di
    join (
      select coalesce(nullif(ll.variant, ''), nullif(ll.tracking ->> 'ab', ''), '') code, ll.optin_at,
        coalesce(ll.califica, false) califica, coalesce(ll.toco_grupo, false) grupo, ll.source
      from public.lead_launches ll
      where ll.optin_at is not null and ll.no_cuenta_reason is null
    ) x on x.optin_at >= di.w_ini and x.optin_at < di.w_fin
    where di.w_fin > di.w_ini and x.code in ('d1', 'd3')
      and (fuente = 'todas' or (fuente = 'pauta') = (x.source = 'Anuncios de Meta'))
    group by 1, 2, 3
  ),
  filas as (
    select di.player_id, jsonb_agg(jsonb_build_object(
      'dia', di.dia,
      'en_periodo', di.w_fin > di.w_ini,
      'desde', case when di.w_fin > di.w_ini then di.w_ini end,
      'hasta', case when di.w_fin > di.w_ini then di.w_fin end,
      'visitas_estimadas', di.dia < log_day,
      'plays', coalesce(vd.plays, 0), 'plays_unicos', coalesce(vd.plays_unicos, 0),
      'vistas', coalesce(vd.vistas, 0), 'vistas_unicas', coalesce(vd.vistas_unicas, 0),
      'terminaron', coalesce(vd.terminaron, 0), 'clicks', coalesce(vd.clicks, 0),
      'sobre_pitch', coalesce(vd.sobre_pitch, 0), 'conversiones', coalesce(vd.conversiones, 0),
      'play_rate_vturb', vd.play_rate_vturb, 'promedio_visto_seg', vd.promedio_visto_seg,
      'curva', vd.curva, 'sincronizado', vd.fetched_at,
      'visitas_con_video', coalesce(vl.con_video, vo.con_video, 0),
      'd1', jsonb_build_object('visitas', coalesce(vl.d1, vo.d1, 0), 'registros', coalesce(r1.registros, 0),
              'calificados', coalesce(r1.calificados, 0), 'grupo', coalesce(r1.grupo, 0)),
      'd3', jsonb_build_object('visitas', coalesce(vl.d3, vo.d3, 0), 'registros', coalesce(r3.registros, 0),
              'calificados', coalesce(r3.calificados, 0), 'grupo', coalesce(r3.grupo, 0))
    ) order by di.dia) j
    from dias di
    left join public.vsl_daily vd on vd.player_id = di.player_id and vd.dia = di.dia
    left join vis_log vl on vl.player_id = di.player_id and vl.dia = di.dia
    left join vis_old vo on vo.player_id = di.player_id and vo.dia = di.dia
    left join reg r1 on r1.player_id = di.player_id and r1.dia = di.dia and r1.code = 'd1'
    left join reg r3 on r3.player_id = di.player_id and r3.dia = di.dia and r3.code = 'd3'
    group by di.player_id
  )
  select jsonb_build_object(
    'generado', now(), 'fuente', fuente, 'log_desde', log_since,
    'sync', jsonb_build_object(
      'ultimo', (select jsonb_build_object('at', r.at, 'ok', r.ok, 'detalle', r.detalle) from public.vsl_sync_runs r order by r.at desc limit 1),
      'ultimo_ok', (select max(r.at) from public.vsl_sync_runs r where r.ok)
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', p.player_id, 'video_id', p.video_id, 'nombre', p.nombre,
        'desde', p.desde, 'hasta', p.hasta, 'desde_fuente', p.desde_fuente,
        'duracion_seg', p.duracion_seg, 'pitch_seg', p.pitch_seg, 'sort', p.sort,
        'plays_despues', p.plays_despues, 'plays_despues_at', p.plays_despues_at,
        'sincronizado_at', p.sincronizado_at,
        'dias', coalesce(f.j, '[]'::jsonb)
      ) order by p.sort desc, p.desde desc nulls last)
      from public.vsl_players p left join filas f on f.player_id = p.player_id
    ), '[]'::jsonb)
  ) into res;
  return res;
end;
$$;
revoke all on function public.crm_vsl(text) from public, anon;
grant execute on function public.crm_vsl(text) to authenticated, service_role;

-- ---------- Corrida programada: una vez por hora ----------
select cron.schedule('vturb-sync', '17 * * * *', $cron$
  select net.http_post(
    url := 'https://zanwrwysbmvgytfzymaz.supabase.co/functions/v1/vturb-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-key', (select key from private.vsl_cron_key)),
    body := '{"action":"sync"}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
