-- =====================================================================
-- Paso 7 · Ingesta por funnel y palabras clave.
-- - ingest_optin / visita / grupo / aplicacion aceptan un campo opcional
--   `funnel` (o `launch_id`). Sin ese campo se comportan igual que hoy:
--   ciclo actual del funnel `webinar`. El contrato de la landing no cambia.
-- - Ruta nueva /palabra → ingest_palabra: ManyChat (o el setter desde el
--   panel, con crm_register_keyword) avisa que alguien escribió una palabra.
-- Los cuerpos de ingest_* son los vigentes; solo cambia de dónde sale el ciclo
-- y, en la aplicación, lo propio del evergreen (etapa «Aplicó» y preguntas nuevas).
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

CREATE OR REPLACE FUNCTION public.ingest_optin(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e text := private.norm_email(p ->> 'email');
  ph text := private.norm_phone(p ->> 'telefono');
  nombre text := trim(coalesce(p ->> 'nombre', ''));
  launch text := private.ingest_launch(p);
  t jsonb := case when jsonb_typeof(p -> 'tracking') = 'object' then p -> 'tracking' else '{}'::jsonb end;
  inv text := nullif(trim(coalesce(p ->> 'inversion_meta', '')), '');
  cal boolean := private.califica(inv, p ->> 'califica');
  variante text := coalesce(nullif(p ->> 'variant', ''), nullif(t ->> 'ab', ''));
  fuente text := private.lead_source(t);
  v_lead uuid;
  v_existed boolean;
  prev_count int;
begin
  if launch is null then
    return jsonb_build_object('ok', false, 'error', 'Funnel o ciclo desconocido');
  end if;
  if e is null and ph is null then
    return jsonb_build_object('ok', false, 'error', 'Falta email y teléfono');
  end if;

  select u.lead_id, u.existed into v_lead, v_existed from private.upsert_lead(e, ph, nombre, false) u;
  if v_existed then
    perform private.merge_contact(v_lead, launch, e, ph, 'Optin');
  end if;

  select optin_count into prev_count from public.lead_launches where lead_id = v_lead and launch_id = launch;

  insert into public.lead_launches as ll (lead_id, launch_id, optin_at, optin_count, inversion_meta, califica, variant, tracking, source)
  values (v_lead, launch, now(), 1, inv, cal, variante, t, fuente)
  on conflict (lead_id, launch_id) do update set
    optin_at = coalesce(ll.optin_at, excluded.optin_at),
    optin_count = ll.optin_count + 1,
    inversion_meta = coalesce(excluded.inversion_meta, ll.inversion_meta),
    califica = coalesce(excluded.califica, ll.califica),
    variant = case when ll.optin_at is null then excluded.variant else ll.variant end,
    tracking = case when ll.optin_at is null then excluded.tracking else ll.tracking end,
    source = case when ll.optin_at is null then excluded.source else ll.source end,
    updated_at = now();

  insert into public.lead_events (lead_id, launch_id, kind, summary, data)
  values (
    v_lead, launch,
    case when coalesce(prev_count, 0) > 0 then 'optin_repetido' else 'optin' end,
    case when coalesce(prev_count, 0) > 0 then 'Se registró de nuevo en la landing' else 'Se registró en la landing' end
      || ' · ' || coalesce(inv, 'sin inversión') || ' · ' || case when cal then 'califica' when not cal then 'no califica' else 'califica ?' end
      || ' · versión ' || coalesce(variante, '—') || ' · ' || fuente,
    jsonb_build_object('nombre', nombre, 'email', e, 'telefono', ph, 'inversion_meta', inv, 'califica', cal,
      'califica_enviado', p -> 'califica', 'variant', variante, 'tracking', t, 'source', fuente)
  );

  -- Todos los optins reciben SDR (si ya tenía, assign_sdr lo deja como estaba).
  if private.auto_assign_enabled() then
    perform private.assign_sdr(v_lead, launch, case when cal then 'optin calificado' else 'optin' end);
  end if;

  perform private.apply_pending(v_lead, e, ph);

  return jsonb_build_object('ok', true, 'id', v_lead, 'repetido', v_existed);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_visita(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  t jsonb := case when jsonb_typeof(p -> 'tracking') = 'object' then p -> 'tracking' else '{}'::jsonb end;
  launch text := private.ingest_launch(p);
  fuente text := private.lead_source(t);
  version text := coalesce(t ->> 'ab', '');
begin
  if launch is null then
    return jsonb_build_object('ok', false, 'error', 'Funnel o ciclo desconocido');
  end if;
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

CREATE OR REPLACE FUNCTION public.ingest_grupo(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e text := private.norm_email(p ->> 'email');
  ph text := private.norm_phone(p ->> 'telefono');
  launch text := private.ingest_launch(p);
  v_lead uuid;
begin
  if launch is null then
    return jsonb_build_object('ok', false, 'error', 'Funnel o ciclo desconocido');
  end if;
  if e is null and ph is null then
    return jsonb_build_object('ok', false, 'error', 'Falta email');
  end if;
  v_lead := private.find_lead(e, ph);
  if v_lead is null then
    insert into public.lead_pending_events (kind, email, phone, launch_id, payload)
    values ('grupo', e, ph, launch, p);
    return jsonb_build_object('ok', true, 'pendiente', true);
  end if;

  insert into public.lead_launches as ll (lead_id, launch_id, toco_grupo, toco_grupo_at)
  values (v_lead, launch, true, now())
  on conflict (lead_id, launch_id) do update
    set toco_grupo = true,
        toco_grupo_at = coalesce(ll.toco_grupo_at, excluded.toco_grupo_at),
        updated_at = now();
  insert into public.lead_events (lead_id, launch_id, kind, summary)
  values (v_lead, launch, 'grupo', 'Tocó "Entrar al grupo de WhatsApp"');
  return jsonb_build_object('ok', true, 'pendiente', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_aplicacion(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o_e text := private.norm_email(p -> 'optin' ->> 'email');
  o_ph text := private.norm_phone(p -> 'optin' ->> 'telefono');
  t_e text := private.norm_email(p ->> 'email');
  t_ph text := private.norm_phone(p ->> 'telefono');
  nombre text := trim(coalesce(p ->> 'nombre', ''));
  inv text := trim(coalesce(p ->> 'inversion', ''));
  rechazado boolean := inv = 'Menos de USD 1.000';
  launch text := private.ingest_launch(p);
  link jsonb := case when jsonb_typeof(p -> 'tracking_link') = 'object' then p -> 'tracking_link' else '{}'::jsonb end;
  sale_states text[] := array['Agendado', 'No se cerró', 'Cliente · falta onboarding', 'Cliente'];
  v_lead uuid;
  v_existed boolean := false;
  v_sdr uuid;
  v_sdr_name text := '';
  v_wa text := '';
  resumen text;
  evergreen boolean;
  v_sells boolean;
begin
  if launch is null then
    return jsonb_build_object('ok', false, 'error', 'Funnel o ciclo desconocido');
  end if;
  evergreen := private.launch_kind(launch) = 'evergreen';
  if o_e is not null or o_ph is not null then
    v_lead := private.find_lead(o_e, o_ph);
  end if;
  if v_lead is null and (t_e is not null or t_ph is not null) then
    v_lead := private.find_lead(t_e, t_ph);
  end if;

  if v_lead is not null then
    v_existed := true;
    perform private.merge_contact(v_lead, launch, t_e, t_ph, 'Aplicación');
    if nombre <> '' then
      update public.leads set full_name = nombre, updated_at = now() where id = v_lead and full_name = '';
    end if;
  else
    if coalesce(o_e, t_e) is null and coalesce(o_ph, t_ph) is null then
      return jsonb_build_object('ok', false, 'error', 'Falta email y teléfono');
    end if;
    select u.lead_id, u.existed into v_lead, v_existed
    from private.upsert_lead(coalesce(o_e, t_e), coalesce(o_ph, t_ph), nombre, true) u;
  end if;

  if not rechazado then
    if private.auto_assign_enabled() then
      v_sdr := private.assign_sdr(v_lead, launch, 'aplicó');
    else
      select sdr_id into v_sdr from public.leads where id = v_lead; -- en bolsa: solo si alguien ya lo tomó
    end if;
    select w.sdr_name, w.wa into v_sdr_name, v_wa from private.lead_whatsapp(v_sdr) w;
  end if;

  insert into public.lead_launches as ll (lead_id, launch_id, applied_at, application, application_tracking, route, stage, post_class_status)
  values (
    v_lead, launch, now(), p, link,
    case when rechazado then 'rechazado' else 'aplicado' end,
    case when evergreen then case when rechazado then 'Nutrición' else 'Aplicó' end when rechazado then 'Próximo ciclo' else 'Nuevo' end,
    case when rechazado then null else 'Nuevo lead' end
  )
  on conflict (lead_id, launch_id) do update set
    applied_at = excluded.applied_at,
    application = excluded.application,
    application_tracking = excluded.application_tracking,
    route = excluded.route,
    stage = case when evergreen then case when rechazado then 'Nutrición' when ll.stage in ('Palabra recibida', 'En conversación', 'Calificado', 'Nutrición', 'Nuevo') then 'Aplicó' else ll.stage end
                 when rechazado then 'Próximo ciclo' else ll.stage end,
    post_class_status = case
      when ll.post_class_status = any (sale_states) then ll.post_class_status
      when rechazado then null
      else 'Nuevo lead'
    end,
    updated_at = now();

  if evergreen then
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

  resumen := case when evergreen then 'Aplicó' else 'Aplicó post-clase' end
    || case when rechazado then ' · rechazado (próximo ciclo)'
            else ' · SDR ' || coalesce(nullif(v_sdr_name, ''), case when v_sdr is null then 'sin asignar' else '—' end) end
    || case when not v_existed then ' · sin optin previo (posible duplicado)' else '' end
    || E'\nObjetivo: ' || coalesce(p ->> 'objetivo', '—')
    || E'\nFreno: ' || coalesce(p ->> 'freno', '—')
    || E'\nHace cuánto: ' || coalesce(p ->> 'hace_cuanto', '—')
    || E'\nConoce a Manu: ' || coalesce(p ->> 'conoce_manu', '—')
    || E'\nPor qué ahora: ' || coalesce(p ->> 'por_que_ahora', '—')
    || E'\nCiclo: ' || coalesce(p ->> 'ciclo', '—')
    || E'\nFacturación: ' || coalesce(p ->> 'facturacion', '—')
    || E'\nInversión: ' || coalesce(nullif(inv, ''), '—')
    || case when evergreen then E'\n¿Vende hoy?: ' || coalesce(p ->> 'vende_hoy', '—') || E'\nQué vende: ' || coalesce(p ->> 'que_vende', '—')
         || E'\nCada cuánto se termina: ' || coalesce(p ->> 'ciclo_recompra', '—') || E'\nCapital: ' || coalesce(p ->> 'capital', '—')
         || E'\nQué video lo trajo: ' || coalesce(p ->> 'video', '—') else '' end
    || E'\nLlegó por: ' || private.lead_source(link)
    || coalesce(' (' || nullif(concat_ws(' / ', link ->> 'utm_source', link ->> 'utm_medium', link ->> 'utm_campaign', link ->> 'utm_content'), '') || ')', '');

  insert into public.lead_events (lead_id, launch_id, kind, summary, data)
  values (v_lead, launch, 'aplicacion', resumen, p);

  return jsonb_build_object(
    'ok', true,
    'ruta', case when rechazado then 'rechazado' else 'aplicado' end,
    'sdr', v_sdr_name,
    'wa', v_wa
  );
end;
$function$;

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

