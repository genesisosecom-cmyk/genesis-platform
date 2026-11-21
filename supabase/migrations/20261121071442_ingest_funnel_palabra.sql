-- =====================================================================
-- Paso 7 · Ingesta por funnel y palabras clave.
-- - ingest_optin / visita / grupo / aplicacion aceptan un campo opcional
--   `funnel` (o `launch_id`). Sin ese campo se comportan igual que hoy:
--   ciclo actual del funnel `webinar`. El contrato de la landing no cambia.
-- - Ruta nueva /palabra → ingest_palabra: ManyChat (o el setter desde el
--   panel, con crm_register_keyword) avisa que alguien escribió una palabra.
--
-- Las cuatro funciones de la landing no se reescriben: se toma la definición
-- viva y se le cambia solo de dónde sale el ciclo y, en la aplicación, lo propio
-- del evergreen (etapa «Aplicó» y las preguntas nuevas). Si alguna línea esperada
-- no está, la migración falla entera y no toca nada.
-- =====================================================================

-- Ciclo al que entra un evento. `funnel` acepta el id del funnel o su tipo («evergreen»).
create function private.ingest_launch(p jsonb)
returns text language sql stable set search_path = '' as $$
  select case
    when nullif(trim(p ->> 'launch_id'), '') is not null then (select id from public.launches where id = trim(p ->> 'launch_id'))
    when nullif(trim(p ->> 'funnel'), '') is not null then (
      select l.id from public.launches l join public.funnels f on f.id = l.funnel_id
      where l.is_current and f.active and (f.id = lower(trim(p ->> 'funnel')) or f.kind = lower(trim(p ->> 'funnel')))
      order by (f.id = lower(trim(p ->> 'funnel'))) desc, f.sort limit 1)
    else private.current_launch()
  end;
$$;
revoke execute on function private.ingest_launch(jsonb) from public, anon, authenticated;

-- Pieza de contenido que trajo al lead. Hasta que exista el registro de contenido (paso 8) no resuelve nada.
create function private.content_for_keyword(p_launch text, p_keyword text, p_at timestamptz, p_url text)
returns uuid language sql stable set search_path = '' as $$
  select null::uuid;
$$;
revoke execute on function private.content_for_keyword(text, text, timestamptz, text) from public, anon, authenticated;

do $mig$
declare
  d text;
begin
  -- Reemplaza `a` por `b`; falla (y no se aplica nada) si `a` no aparece exactamente una vez.
  create function pg_temp.swap(s text, a text, b text) returns text language plpgsql as $f$
  begin
    if (length(s) - length(replace(s, a, ''))) / length(a) <> 1 then raise exception 'No encontré una sola vez: «%»', a; end if;
    return replace(s, a, b);
  end $f$;

  -- ingest_optin
  d := pg_get_functiondef('public.ingest_optin(jsonb)'::regprocedure);
  d := pg_temp.swap(d, $q$launch text := private.current_launch();$q$, $q$launch text := private.ingest_launch(p);$q$);
  d := pg_temp.swap(d, $q$  if e is null and ph is null then
    return jsonb_build_object('ok', false, 'error', 'Falta email y teléfono');$q$, $q$  if launch is null then
    return jsonb_build_object('ok', false, 'error', 'Funnel o ciclo desconocido');
  end if;
  if e is null and ph is null then
    return jsonb_build_object('ok', false, 'error', 'Falta email y teléfono');$q$);
  execute d;

  -- ingest_visita
  d := pg_get_functiondef('public.ingest_visita(jsonb)'::regprocedure);
  d := pg_temp.swap(d, $q$launch text := private.current_launch();$q$, $q$launch text := private.ingest_launch(p);$q$);
  d := pg_temp.swap(d, $q$  insert into public.landing_visits as lv$q$, $q$  if launch is null then
    return jsonb_build_object('ok', false, 'error', 'Funnel o ciclo desconocido');
  end if;
  insert into public.landing_visits as lv$q$);
  execute d;

  -- ingest_grupo
  d := pg_get_functiondef('public.ingest_grupo(jsonb)'::regprocedure);
  d := pg_temp.swap(d, $q$launch text := private.current_launch();$q$, $q$launch text := private.ingest_launch(p);$q$);
  d := pg_temp.swap(d, $q$  if e is null and ph is null then
    return jsonb_build_object('ok', false, 'error', 'Falta email');$q$, $q$  if launch is null then
    return jsonb_build_object('ok', false, 'error', 'Funnel o ciclo desconocido');
  end if;
  if e is null and ph is null then
    return jsonb_build_object('ok', false, 'error', 'Falta email');$q$);
  execute d;

  -- ingest_aplicacion
  d := pg_get_functiondef('public.ingest_aplicacion(jsonb)'::regprocedure);
  d := pg_temp.swap(d, $q$launch text := private.current_launch();$q$, $q$launch text := private.ingest_launch(p);$q$);
  d := pg_temp.swap(d, $q$  if o_e is not null or o_ph is not null then
    v_lead := private.find_lead(o_e, o_ph);$q$, $q$  if launch is null then
    return jsonb_build_object('ok', false, 'error', 'Funnel o ciclo desconocido');
  end if;
  evergreen := private.launch_kind(launch) = 'evergreen';
  if o_e is not null or o_ph is not null then
    v_lead := private.find_lead(o_e, o_ph);$q$);
  d := pg_temp.swap(d, $q$  resumen text;
begin
$q$, $q$  resumen text;
  evergreen boolean;
  v_sells boolean;
begin
$q$);
  d := pg_temp.swap(d, $q$    case when rechazado then 'Próximo ciclo' else 'Nuevo' end,
$q$, $q$    case when evergreen then case when rechazado then 'Nutrición' else 'Aplicó' end when rechazado then 'Próximo ciclo' else 'Nuevo' end,
$q$);
  d := pg_temp.swap(d, $q$    stage = case when rechazado then 'Próximo ciclo' else ll.stage end,
$q$, $q$    stage = case when evergreen then case when rechazado then 'Nutrición' when ll.stage in ('Palabra recibida', 'En conversación', 'Calificado', 'Nutrición', 'Nuevo') then 'Aplicó' else ll.stage end
                 when rechazado then 'Próximo ciclo' else ll.stage end,
$q$);
  d := pg_temp.swap(d, $q$  resumen := 'Aplicó post-clase'$q$, $q$  if evergreen then
    v_sells := case
      when lower(trim(coalesce(p ->> 'vende_hoy', ''))) in ('sí', 'si', 'true') then true
      when lower(trim(coalesce(p ->> 'vende_hoy', ''))) in ('no', 'false') then false end;
    update public.lead_launches set
      sells_today = coalesce(v_sells, sells_today),
      sells_what = coalesce(nullif(trim(p ->> 'que_vende'), ''), sells_what),
      repurchase_cycle = coalesce(nullif(trim(coalesce(p ->> 'ciclo_recompra', p ->> 'ciclo')), ''), repurchase_cycle),
      capital = coalesce(nullif(trim(p ->> 'capital'), ''), capital),
      wanted_when = coalesce(nullif(trim(p ->> 'cuando'), ''), wanted_when),
      entry_content_id = coalesce(entry_content_id, private.content_for_keyword(launch, null, now(), p ->> 'video'))
    where lead_id = v_lead and launch_id = launch;
    update public.lead_launches set califica = private.califica_evergreen(sells_today, lane)
    where lead_id = v_lead and launch_id = launch;
  end if;

  resumen := case when evergreen then 'Aplicó' else 'Aplicó post-clase' end$q$);
  d := pg_temp.swap(d, $q$    || E'\nInversión: ' || coalesce(nullif(inv, ''), '—')
$q$, $q$    || E'\nInversión: ' || coalesce(nullif(inv, ''), '—')
    || case when evergreen then E'\n¿Vende hoy?: ' || coalesce(p ->> 'vende_hoy', '—') || E'\nQué vende: ' || coalesce(p ->> 'que_vende', '—')
         || E'\nCada cuánto se termina: ' || coalesce(p ->> 'ciclo_recompra', '—') || E'\nCapital: ' || coalesce(p ->> 'capital', '—')
         || E'\nQué video lo trajo: ' || coalesce(p ->> 'video', '—') else '' end
$q$);
  execute d;

  drop function pg_temp.swap(text, text, text);
end
$mig$;

-- ---------- Palabras clave ----------
-- Cuerpo: nombre, instagram y/o telefono (y/o email), keyword, canal, content_url (opcional),
-- funnel o launch_id (opcional; por defecto, el ciclo actual del evergreen).
-- Crea o encuentra el lead, lo suma al ciclo con su palabra y deja el evento «palabra».
create function private.register_keyword(p jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  e text := private.norm_email(p ->> 'email');
  ph text := private.norm_phone(p ->> 'telefono');
  ig text := private.norm_instagram(p ->> 'instagram');
  nombre text := trim(coalesce(p ->> 'nombre', ''));
  kw text := upper(nullif(trim(coalesce(p ->> 'keyword', '')), ''));
  canal text := lower(nullif(trim(coalesce(p ->> 'canal', '')), ''));
  launch text := case
    when p ?| array['funnel', 'launch_id'] then private.ingest_launch(p)
    else (select l.id from public.launches l join public.funnels f on f.id = l.funnel_id
          where l.is_current and f.active and f.kind = 'evergreen' order by f.sort limit 1) end;
  v_lead uuid;
  v_existed boolean;
  v_ll uuid;
  v_content uuid;
  v_first boolean;
begin
  if launch is null then return jsonb_build_object('ok', false, 'error', 'Funnel o ciclo desconocido'); end if;
  if kw is null then return jsonb_build_object('ok', false, 'error', 'Falta la palabra (keyword)'); end if;
  if e is null and ph is null and ig is null then
    return jsonb_build_object('ok', false, 'error', 'Falta instagram, teléfono o email');
  end if;
  canal := case
    when canal in ('instagram_dm', 'instagram_comentario', 'whatsapp', 'youtube', 'tiktok', 'otro') then canal
    when canal in ('dm', 'instagram', 'ig') then 'instagram_dm'
    when canal in ('comentario', 'comment') then 'instagram_comentario'
    when canal in ('wsp', 'wa') then 'whatsapp'
    when canal is not null then 'otro'
    when ig is not null then 'instagram_dm'
    when ph is not null then 'whatsapp'
    else 'otro' end;

  select u.lead_id, u.existed into v_lead, v_existed from private.upsert_lead(e, ph, ig, nombre, false) u;
  v_content := private.content_for_keyword(launch, kw, now(), p ->> 'content_url');
  v_first := not exists (select 1 from public.lead_launches where lead_id = v_lead and launch_id = launch);

  insert into public.lead_launches as ll (lead_id, launch_id, stage, entry_keyword, entry_channel, entry_content_id, source, tracking)
  values (v_lead, launch, 'Palabra recibida', kw, canal, v_content, 'Palabra · ' || kw,
          jsonb_strip_nulls(jsonb_build_object('keyword', kw, 'canal', canal, 'content_url', nullif(p ->> 'content_url', ''))))
  on conflict (lead_id, launch_id) do update set
    -- La primera palabra es la que lo trajo; las siguientes quedan en el historial.
    entry_keyword = coalesce(ll.entry_keyword, excluded.entry_keyword),
    entry_channel = coalesce(ll.entry_channel, excluded.entry_channel),
    entry_content_id = coalesce(ll.entry_content_id, excluded.entry_content_id),
    source = coalesce(ll.source, excluded.source),
    updated_at = now()
  returning id into v_ll;

  perform private.log_event(v_lead, launch, 'palabra',
    'Escribió ' || kw || ' · ' || replace(canal, '_', ' ') || case when v_first then '' else ' (ya estaba en el ciclo)' end,
    p || jsonb_build_object('keyword', kw, 'canal', canal, 'content_id', v_content));

  if private.auto_assign_enabled() then
    perform private.assign_sdr(v_lead, launch, 'palabra ' || kw);
  end if;
  perform private.sync_lead(v_ll);

  return jsonb_build_object('ok', true, 'id', v_lead, 'lead_launch_id', v_ll, 'repetido', v_existed);
end;
$$;
revoke execute on function private.register_keyword(jsonb) from public, anon, authenticated;

-- La llama la Edge Function `ingest` (ruta /palabra).
create function public.ingest_palabra(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return private.register_keyword(p);
end;
$$;
revoke execute on function public.ingest_palabra(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_palabra(jsonb) to service_role;

-- La misma carga, a mano desde el panel (admin, setter o closer). Si la carga un SDR y el lead
-- no tiene dueño, queda para él.
create function public.crm_register_keyword(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.my_sdr_id();
  r jsonb;
begin
  if not (private.is_superadmin() or me is not null or private.my_closer_id() is not null) then
    raise exception 'Sin permisos para cargar leads';
  end if;
  r := private.register_keyword(p);
  if not (r ->> 'ok')::boolean then raise exception '%', r ->> 'error'; end if;
  if me is not null then
    update public.leads set sdr_id = me, updated_at = now() where id = (r ->> 'id')::uuid and sdr_id is null;
    if found then
      perform private.log_event((r ->> 'id')::uuid, (select launch_id from public.lead_launches where id = (r ->> 'lead_launch_id')::uuid),
        'sdr', 'Se asignó el lead (carga de palabra)', jsonb_build_object('sdr_id', me));
      perform private.sync_lead((r ->> 'lead_launch_id')::uuid);
    end if;
  end if;
  return r;
end;
$$;
revoke execute on function public.crm_register_keyword(jsonb) from public, anon;
grant execute on function public.crm_register_keyword(jsonb) to authenticated;

