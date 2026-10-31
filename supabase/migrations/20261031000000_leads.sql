-- =====================================================================
-- Leads de la landing de Génesis (applygenesis.com)
-- La landing reenvía cada evento server-to-server a la Edge Function `ingest`,
-- que llama a una de las funciones ingest_* de abajo (una sola llamada por evento).
-- Las tablas quedan pensadas para los paneles de SDR y closer. Solo superadmin.
-- =====================================================================

-- ---------- Lanzamientos (cada clase) ----------
create table public.launches (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  name text not null,
  starts_at timestamptz,
  is_current boolean not null default false, -- los eventos que llegan se asignan al lanzamiento actual
  created_at timestamptz not null default now()
);
create unique index launches_one_current_idx on public.launches (is_current) where is_current;

-- ---------- Equipo comercial (SDR y closers) ----------
create table public.sales_reps (
  name text primary key,
  kind text not null default 'sdr' check (kind in ('sdr', 'closer')),
  whatsapp_url text not null default '',
  assign_order int not null default 0,  -- orden de la lista del reparto determinístico
  active boolean not null default true,
  profile_id uuid references public.profiles (id) on delete set null, -- usuario del campus (paneles)
  created_at timestamptz not null default now()
);

-- ---------- Leads: la persona, única por email y/o teléfono ----------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  email text unique check (email = lower(email)),
  phone text unique check (phone ~ '^[0-9]+$'), -- solo dígitos, con código de país
  full_name text not null default '',
  sdr text references public.sales_reps (name) on update cascade on delete set null, -- fijo por persona
  possible_duplicate boolean not null default false, -- aplicó sin que encontremos su optin
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create index leads_sdr_idx on public.leads (sdr);

-- ---------- Lead × lanzamiento: optin, grupo, aplicación y estado comercial ----------
create table public.lead_launches (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  launch_id text not null references public.launches (id) on update cascade,
  -- Optin (fecha, variante, tracking y fuente quedan los del primer optin del lanzamiento)
  optin_at timestamptz,
  optin_count int not null default 0,
  inversion_meta text,
  califica boolean,
  variant text,
  tracking jsonb not null default '{}'::jsonb,
  source text,
  -- Pipeline pre-clase (panel de SDR)
  stage text not null default 'Nuevo',
  contact_attempts int not null default 0 check (contact_attempts >= 0),
  -- Thank you page
  toco_grupo boolean not null default false,
  toco_grupo_at timestamptz,
  -- Aplicación post-clase
  applied_at timestamptz,
  application jsonb,
  application_tracking jsonb,
  route text check (route in ('aplicado', 'rechazado')),
  -- Post-clase (paneles de SDR y closer)
  post_class_status text check (post_class_status in (
    'Nuevo lead', 'No atendió', 'Agendado', 'No se cerró', 'Cliente · falta onboarding', 'Cliente'
  )),
  closer text references public.sales_reps (name) on update cascade on delete set null,
  next_action_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, launch_id)
);
create index lead_launches_launch_idx on public.lead_launches (launch_id, optin_at desc);
create index lead_launches_stage_idx on public.lead_launches (launch_id, stage);
create index lead_launches_status_idx on public.lead_launches (launch_id, post_class_status);
create index lead_launches_closer_idx on public.lead_launches (closer);

-- ---------- Historial del lead ----------
create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  launch_id text references public.launches (id) on update cascade on delete set null,
  kind text not null,           -- optin, optin_repetido, grupo, aplicacion, dato_distinto, nota…
  summary text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null, -- null = evento automático
  created_at timestamptz not null default now()
);
create index lead_events_lead_idx on public.lead_events (lead_id, created_at desc);

-- ---------- Visitas de la landing: contador por día, fuente y versión ----------
create table public.landing_visits (
  launch_id text not null references public.launches (id) on update cascade on delete cascade,
  day date not null,            -- día en hora de Argentina
  source text not null,
  variant text not null default '',
  visits int not null default 0,
  primary key (launch_id, day, source, variant)
);

-- ---------- Eventos que llegaron antes que el optin (ej: /grupo) ----------
create table public.lead_pending_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('grupo')),
  email text,
  phone text,
  launch_id text references public.launches (id) on update cascade on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  applied_at timestamptz,
  lead_id uuid references public.leads (id) on delete cascade
);
create index lead_pending_email_idx on public.lead_pending_events (email) where applied_at is null;
create index lead_pending_phone_idx on public.lead_pending_events (phone) where applied_at is null;

-- ---------- Log crudo de lo que llega a /ingest ----------
create table public.ingest_log (
  id bigint generated always as identity primary key,
  endpoint text not null,
  secret text not null check (secret in ('ok', 'falta', 'invalido', 'sin_config')),
  payload jsonb,
  status int not null,
  result jsonb,
  error text,
  ms int,
  created_at timestamptz not null default now()
);
create index ingest_log_created_idx on public.ingest_log (created_at desc);

-- ---------- RLS: solo superadmin (la Edge Function usa la service role) ----------
alter table public.launches enable row level security;
alter table public.sales_reps enable row level security;
alter table public.leads enable row level security;
alter table public.lead_launches enable row level security;
alter table public.lead_events enable row level security;
alter table public.landing_visits enable row level security;
alter table public.lead_pending_events enable row level security;
alter table public.ingest_log enable row level security;

create policy "launches: solo admin" on public.launches
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "sales_reps: solo admin" on public.sales_reps
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "leads: solo admin" on public.leads
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "lead_launches: solo admin" on public.lead_launches
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "lead_events: solo admin" on public.lead_events
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "landing_visits: solo admin" on public.landing_visits
  for select to authenticated using ((select private.is_superadmin()));
create policy "lead_pending_events: solo admin" on public.lead_pending_events
  for select to authenticated using ((select private.is_superadmin()));
create policy "ingest_log: solo admin" on public.ingest_log
  for select to authenticated using ((select private.is_superadmin()));

-- ---------- Datos iniciales ----------
insert into public.launches (id, name, starts_at, is_current) values
  ('clase-17-11', 'Clase martes 17/11 · 18 hs', '2026-11-17 18:00:00-03', true);

insert into public.sales_reps (name, kind, whatsapp_url, assign_order) values
  ('Mati', 'sdr', 'https://wa.link/9xcaz0', 0),
  ('Santi', 'sdr', 'https://wa.link/xqbxzd', 1);

-- =====================================================================
-- Helpers (esquema private, no expuesto por la API)
-- =====================================================================

create function private.norm_email(v text)
returns text language sql immutable set search_path = '' as $$
  select nullif(lower(trim(coalesce(v, ''))), '');
$$;

create function private.norm_phone(v text)
returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(coalesce(v, ''), '[^0-9]', '', 'g'), '');
$$;

-- Fuente a partir del tracking. Un utm_source que no sea facebook gana aunque venga
-- fbclid (Instagram lo agrega a los links orgánicos).
create function private.lead_source(t jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  src text := trim(coalesce(t ->> 'utm_source', ''));
  med text := trim(coalesce(t ->> 'utm_medium', ''));
begin
  if lower(src) = 'instagram' and lower(med) = 'bio' then
    return 'Instagram · bio';
  end if;
  if src <> '' and lower(src) <> 'facebook' then
    return upper(left(src, 1)) || substr(src, 2) || case when med <> '' then ' · ' || med else '' end;
  end if;
  if lower(src) = 'facebook' or coalesce(t ->> 'fbclid', '') <> '' or coalesce(t ->> 'ad_id', '') <> '' then
    return 'Anuncios de Meta';
  end if;
  return 'Directo / sin UTM';
end;
$$;

-- Califica = invierte 100 dólares por día o más. Si el texto no es una opción conocida,
-- se usa lo que mandó la landing (null si tampoco viene).
create function private.califica(inversion text, enviado text)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when inversion in ('De 100 a 200 dólares', 'De 200 a 500 dólares', 'De 500 a 1.000 dólares', 'Más de 1.000 dólares') then true
    when inversion in ('0, todavía no tengo marca', 'Menos de 100 dólares') then false
    when lower(trim(coalesce(enviado, ''))) in ('sí', 'si', 'true') then true
    when lower(trim(coalesce(enviado, ''))) in ('no', 'false') then false
  end;
$$;

-- Hash determinístico igual al de JS: h = (h*31 + charCode) >>> 0.
create function private.sdr_hash(k text)
returns bigint language plpgsql immutable set search_path = '' as $$
declare
  h bigint := 0;
  i int;
begin
  for i in 1 .. coalesce(length(k), 0) loop
    h := (h * 31 + ascii(substr(k, i, 1))) % 4294967296;
  end loop;
  return h;
end;
$$;

create function private.current_launch()
returns text language sql stable set search_path = '' as $$
  select id from public.launches where is_current limit 1;
$$;

-- Busca primero por email y después por teléfono.
create function private.find_lead(e text, ph text)
returns uuid language sql stable set search_path = '' as $$
  select coalesce(
    (select id from public.leads where e is not null and email = e),
    (select id from public.leads where ph is not null and phone = ph)
  );
$$;

-- Completa email/teléfono vacíos sin pisar los existentes; si son distintos, lo anota.
create function private.merge_contact(p_lead uuid, p_launch text, e text, ph text, origen text)
returns void language plpgsql set search_path = '' as $$
declare
  l public.leads;
begin
  select * into l from public.leads where id = p_lead;
  if e is not null and l.email is null and not exists (select 1 from public.leads where email = e) then
    update public.leads set email = e, updated_at = now() where id = p_lead;
  elsif e is not null and l.email is distinct from e then
    insert into public.lead_events (lead_id, launch_id, kind, summary, data)
    values (p_lead, p_launch, 'dato_distinto', origen || ': escribió otro email (' || e || ')', jsonb_build_object('email', e));
  end if;
  if ph is not null and l.phone is null and not exists (select 1 from public.leads where phone = ph) then
    update public.leads set phone = ph, updated_at = now() where id = p_lead;
  elsif ph is not null and l.phone is distinct from ph then
    insert into public.lead_events (lead_id, launch_id, kind, summary, data)
    values (p_lead, p_launch, 'dato_distinto', origen || ': escribió otro teléfono (+' || ph || ')', jsonb_build_object('telefono', ph));
  end if;
end;
$$;

-- Crea el lead; si otro request lo creó en paralelo, devuelve ese. existed = ya existía.
create function private.upsert_lead(e text, ph text, nombre text, dup boolean, out lead_id uuid, out existed boolean)
language plpgsql set search_path = '' as $$
begin
  lead_id := private.find_lead(e, ph);
  existed := lead_id is not null;
  if lead_id is null then
    insert into public.leads (email, phone, full_name, possible_duplicate)
    values (e, ph, coalesce(nombre, ''), dup)
    on conflict do nothing
    returning id into lead_id;
    if lead_id is null then
      lead_id := private.find_lead(e, ph);
      existed := true;
    end if;
  end if;
  if nombre <> '' then
    update public.leads set full_name = nombre, updated_at = now() where id = lead_id and full_name = '';
  end if;
end;
$$;

-- Aplica los /grupo que llegaron antes que el lead existiera.
create function private.apply_pending(p_lead uuid, e text, ph text)
returns void language plpgsql set search_path = '' as $$
declare
  pe public.lead_pending_events;
begin
  for pe in
    select * from public.lead_pending_events
    where applied_at is null and ((e is not null and email = e) or (ph is not null and phone = ph))
    order by received_at
    for update skip locked
  loop
    insert into public.lead_launches as ll (lead_id, launch_id, toco_grupo, toco_grupo_at)
    values (p_lead, pe.launch_id, true, pe.received_at)
    on conflict (lead_id, launch_id) do update
      set toco_grupo = true,
          toco_grupo_at = coalesce(ll.toco_grupo_at, excluded.toco_grupo_at),
          updated_at = now();
    insert into public.lead_events (lead_id, launch_id, kind, summary, created_at)
    values (p_lead, pe.launch_id, 'grupo', 'Tocó "Entrar al grupo de WhatsApp" (llegó antes que el optin)', pe.received_at);
    update public.lead_pending_events set applied_at = now(), lead_id = p_lead where id = pe.id;
  end loop;
end;
$$;

-- =====================================================================
-- Endpoints (las llama solo la Edge Function `ingest` con la service role)
-- =====================================================================

-- POST /optin → { ok, id, repetido } o { ok: false, error }
create function public.ingest_optin(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e text := private.norm_email(p ->> 'email');
  ph text := private.norm_phone(p ->> 'telefono');
  nombre text := trim(coalesce(p ->> 'nombre', ''));
  launch text := private.current_launch();
  t jsonb := case when jsonb_typeof(p -> 'tracking') = 'object' then p -> 'tracking' else '{}'::jsonb end;
  inv text := nullif(trim(coalesce(p ->> 'inversion_meta', '')), '');
  cal boolean := private.califica(inv, p ->> 'califica');
  variante text := coalesce(nullif(p ->> 'variant', ''), nullif(t ->> 'ab', ''));
  fuente text := private.lead_source(t);
  v_lead uuid;
  v_existed boolean;
  prev_count int;
begin
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

  perform private.apply_pending(v_lead, e, ph);

  return jsonb_build_object('ok', true, 'id', v_lead, 'repetido', v_existed);
end;
$$;

-- POST /visita → { ok }
create function public.ingest_visita(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t jsonb := case when jsonb_typeof(p -> 'tracking') = 'object' then p -> 'tracking' else '{}'::jsonb end;
begin
  insert into public.landing_visits as lv (launch_id, day, source, variant, visits)
  values (
    private.current_launch(),
    (now() at time zone 'America/Argentina/Buenos_Aires')::date,
    private.lead_source(t),
    coalesce(t ->> 'ab', ''),
    1
  )
  on conflict (launch_id, day, source, variant) do update set visits = lv.visits + 1;
  return jsonb_build_object('ok', true);
end;
$$;

-- POST /grupo → { ok }. Si el lead todavía no existe, queda pendiente hasta el optin.
create function public.ingest_grupo(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e text := private.norm_email(p ->> 'email');
  ph text := private.norm_phone(p ->> 'telefono');
  launch text := private.current_launch();
  v_lead uuid;
begin
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
$$;

-- POST /aplicacion → { ok, ruta, sdr, wa }
create function public.ingest_aplicacion(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o_e text := private.norm_email(p -> 'optin' ->> 'email');
  o_ph text := private.norm_phone(p -> 'optin' ->> 'telefono');
  t_e text := private.norm_email(p ->> 'email');
  t_ph text := private.norm_phone(p ->> 'telefono');
  nombre text := trim(coalesce(p ->> 'nombre', ''));
  inv text := trim(coalesce(p ->> 'inversion', ''));
  rechazado boolean := inv = 'Menos de USD 1.000';
  launch text := private.current_launch();
  link jsonb := case when jsonb_typeof(p -> 'tracking_link') = 'object' then p -> 'tracking_link' else '{}'::jsonb end;
  sale_states text[] := array['Agendado', 'No se cerró', 'Cliente · falta onboarding', 'Cliente'];
  v_lead uuid;
  v_existed boolean := false;
  l public.leads;
  reps text[];
  v_sdr text := '';
  v_wa text := '';
  resumen text;
begin
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

  select * into l from public.leads where id = v_lead for update;

  if not rechazado then
    if l.sdr is null then
      select array_agg(name order by assign_order, name) into reps
      from public.sales_reps where kind = 'sdr' and active;
      if coalesce(array_length(reps, 1), 0) > 0 then
        v_sdr := reps[(private.sdr_hash(coalesce(l.email, l.phone)) % array_length(reps, 1))::int + 1];
        update public.leads set sdr = v_sdr, updated_at = now() where id = v_lead;
      end if;
    else
      v_sdr := l.sdr;
    end if;
    select coalesce(whatsapp_url, '') into v_wa from public.sales_reps where name = v_sdr;
  end if;

  insert into public.lead_launches as ll (lead_id, launch_id, applied_at, application, application_tracking, route, stage, post_class_status)
  values (
    v_lead, launch, now(), p, link,
    case when rechazado then 'rechazado' else 'aplicado' end,
    case when rechazado then 'Próximo ciclo' else 'Nuevo' end,
    case when rechazado then null else 'Nuevo lead' end
  )
  on conflict (lead_id, launch_id) do update set
    applied_at = excluded.applied_at,
    application = excluded.application,
    application_tracking = excluded.application_tracking,
    route = excluded.route,
    stage = case when rechazado then 'Próximo ciclo' else ll.stage end,
    post_class_status = case
      when ll.post_class_status = any (sale_states) then ll.post_class_status
      when rechazado then null
      else 'Nuevo lead'
    end,
    updated_at = now();

  resumen := 'Aplicó post-clase' || case when rechazado then ' · rechazado (próximo ciclo)' else ' · SDR ' || coalesce(nullif(v_sdr, ''), '—') end
    || case when not v_existed then ' · sin optin previo (posible duplicado)' else '' end
    || E'\nObjetivo: ' || coalesce(p ->> 'objetivo', '—')
    || E'\nFreno: ' || coalesce(p ->> 'freno', '—')
    || E'\nHace cuánto: ' || coalesce(p ->> 'hace_cuanto', '—')
    || E'\nConoce a Manu: ' || coalesce(p ->> 'conoce_manu', '—')
    || E'\nPor qué ahora: ' || coalesce(p ->> 'por_que_ahora', '—')
    || E'\nCiclo: ' || coalesce(p ->> 'ciclo', '—')
    || E'\nFacturación: ' || coalesce(p ->> 'facturacion', '—')
    || E'\nInversión: ' || coalesce(nullif(inv, ''), '—')
    || E'\nLlegó por: ' || private.lead_source(link)
    || coalesce(' (' || nullif(concat_ws(' / ', link ->> 'utm_source', link ->> 'utm_medium', link ->> 'utm_campaign', link ->> 'utm_content'), '') || ')', '');

  insert into public.lead_events (lead_id, launch_id, kind, summary, data)
  values (v_lead, launch, 'aplicacion', resumen, p);

  return jsonb_build_object(
    'ok', true,
    'ruta', case when rechazado then 'rechazado' else 'aplicado' end,
    'sdr', v_sdr,
    'wa', v_wa
  );
end;
$$;

revoke execute on function public.ingest_optin(jsonb) from public, anon, authenticated;
revoke execute on function public.ingest_visita(jsonb) from public, anon, authenticated;
revoke execute on function public.ingest_grupo(jsonb) from public, anon, authenticated;
revoke execute on function public.ingest_aplicacion(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_optin(jsonb) to service_role;
grant execute on function public.ingest_visita(jsonb) to service_role;
grant execute on function public.ingest_grupo(jsonb) to service_role;
grant execute on function public.ingest_aplicacion(jsonb) to service_role;

revoke execute on function private.norm_email(text) from public;
revoke execute on function private.norm_phone(text) from public;
revoke execute on function private.lead_source(jsonb) from public;
revoke execute on function private.califica(text, text) from public;
revoke execute on function private.sdr_hash(text) from public;
revoke execute on function private.current_launch() from public;
revoke execute on function private.find_lead(text, text) from public;
revoke execute on function private.merge_contact(uuid, text, text, text, text) from public;
revoke execute on function private.upsert_lead(text, text, text, boolean) from public;
revoke execute on function private.apply_pending(uuid, text, text) from public;
