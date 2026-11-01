-- =====================================================================
-- CRM: equipo de ventas (SDRs y closers), reparto de leads, paneles de SDR
-- y closer, agenda de llamadas y ventas que pasan a Clientes y pagos.
--
-- SDRs y closers son usuarios del campus vinculados a una ficha de sales_reps.
-- Leen solo los leads que les tocan (RLS) y escriben únicamente con las
-- funciones crm_*, que validan el permiso y dejan el historial.
-- =====================================================================

-- ---------- Equipo: reemplaza la tabla anterior (solo tenía a Mati y Santi) ----------
alter table public.leads drop column sdr;
alter table public.lead_launches drop column closer;
alter table public.lead_launches drop column notes; -- las notas van al historial (lead_events)
drop table public.sales_reps;
drop function private.sdr_hash(text);

create table public.sales_reps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp_url text not null default '',
  profile_id uuid unique references public.profiles (id) on delete set null, -- usuario del campus
  sdr_status text check (sdr_status in ('activo', 'pausado', 'baja')),       -- null = no es SDR
  closer_status text check (closer_status in ('activo', 'pausado', 'baja')), -- null = no es closer
  sdr_weight int not null default 1 check (sdr_weight between 1 and 100),    -- peso en el reparto
  rr_credit numeric not null default 0,                                      -- estado del round-robin ponderado
  created_at timestamptz not null default now(),
  check (sdr_status is not null or closer_status is not null)
);

alter table public.leads add column sdr_id uuid references public.sales_reps (id) on delete set null;
create index leads_sdr_idx on public.leads (sdr_id);

alter table public.lead_launches
  add column closer_id uuid references public.sales_reps (id) on delete set null, -- closer de la última llamada
  add column next_action text;
create index lead_launches_closer_idx on public.lead_launches (closer_id);

-- Nombre del autor de cada evento (los SDR no pueden leer otros perfiles).
alter table public.lead_events add column created_by_name text;

-- ---------- Configuración ----------
create table public.crm_settings (
  id boolean primary key default true check (id),
  default_whatsapp_url text not null default '', -- WhatsApp de /aplicacion cuando el lead no tiene SDR
  updated_at timestamptz not null default now()
);
insert into public.crm_settings default values;

-- ---------- Agenda de llamadas del closer ----------
create table public.sales_calls (
  id uuid primary key default gen_random_uuid(),
  lead_launch_id uuid not null references public.lead_launches (id) on delete cascade,
  closer_id uuid references public.sales_reps (id) on delete set null,
  scheduled_at timestamptz not null,
  scheduled_by uuid references public.profiles (id) on delete set null,
  scheduled_by_name text,
  sdr_note text,
  status text not null default 'agendada' check (status in ('agendada', 'realizada', 'cancelada')),
  result text check (result in ('no_cerro', 'cerro')),
  result_note text,
  amount_total numeric(12, 2) check (amount_total >= 0),     -- monto del programa
  amount_collected numeric(12, 2) check (amount_collected >= 0), -- cobrado en la llamada
  currency text not null default 'USD',
  payment_method text,
  receipt_path text,                                         -- comprobante en el bucket "receipts"
  client_id uuid references public.clients (id) on delete set null,
  payment_id uuid references public.payments (id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (result is null or status = 'realizada')
);
create index sales_calls_closer_idx on public.sales_calls (closer_id, scheduled_at);
create index sales_calls_lead_launch_idx on public.sales_calls (lead_launch_id);

-- ---------- Permisos ----------
create function private.my_sdr_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.sales_reps
  where profile_id = (select auth.uid()) and sdr_status in ('activo', 'pausado');
$$;

create function private.my_closer_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.sales_reps
  where profile_id = (select auth.uid()) and closer_status in ('activo', 'pausado');
$$;

-- Admin, el SDR del lead o un closer con una llamada (no cancelada) de ese lead.
create function private.can_see_lead(p_lead uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_superadmin()
    or exists (select 1 from public.leads where id = p_lead and sdr_id is not null and sdr_id = private.my_sdr_id())
    or exists (
      select 1 from public.sales_calls c
      join public.lead_launches ll on ll.id = c.lead_launch_id
      where ll.lead_id = p_lead and c.status <> 'cancelada'
        and c.closer_id is not null and c.closer_id = private.my_closer_id()
    );
$$;

create function private.can_see_call(p_call uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sales_calls c join public.lead_launches ll on ll.id = c.lead_launch_id
    where c.id = p_call and private.can_see_lead(ll.lead_id)
  );
$$;

-- ---------- RLS ----------
alter table public.sales_reps enable row level security;
alter table public.crm_settings enable row level security;
alter table public.sales_calls enable row level security;

create policy "sales_reps: solo admin" on public.sales_reps
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
-- El equipo ve la lista del equipo (para elegir closer y ver nombres en el historial).
create policy "sales_reps: el equipo lee" on public.sales_reps
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.my_sdr_id()) is not null or (select private.my_closer_id()) is not null);

create policy "crm_settings: solo admin" on public.crm_settings
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));

create policy "sales_calls: solo admin" on public.sales_calls
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "sales_calls: el equipo lee las suyas" on public.sales_calls
  for select to authenticated using (private.can_see_call(id));

create policy "leads: el equipo lee los suyos" on public.leads
  for select to authenticated using (private.can_see_lead(id));
create policy "lead_launches: el equipo lee los suyos" on public.lead_launches
  for select to authenticated using (private.can_see_lead(lead_id));
create policy "lead_events: el equipo lee los suyos" on public.lead_events
  for select to authenticated using (private.can_see_lead(lead_id));
create policy "launches: el equipo lee" on public.launches
  for select to authenticated using ((select private.my_sdr_id()) is not null or (select private.my_closer_id()) is not null);

-- ---------- Comprobantes (bucket privado, ruta <call_id>/<archivo>) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('receipts', 'receipts', false, 52428800);

create function private.can_upload_receipt(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_superadmin() or exists (
    select 1 from public.sales_calls
    where id::text = split_part(p_path, '/', 1) and closer_id is not null and closer_id = private.my_closer_id()
  );
$$;

create function private.can_read_receipt(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sales_calls where id::text = split_part(p_path, '/', 1) and private.can_see_call(id));
$$;

create policy "receipts: closer o admin suben" on storage.objects
  for insert to authenticated with check (bucket_id = 'receipts' and private.can_upload_receipt(name));
create policy "receipts: quien ve la llamada descarga" on storage.objects
  for select to authenticated using (bucket_id = 'receipts' and private.can_read_receipt(name));
create policy "receipts: admin borra" on storage.objects
  for delete to authenticated using (bucket_id = 'receipts' and (select private.is_superadmin()));

-- =====================================================================
-- Reparto de SDR: round-robin ponderado entre los SDR activos.
-- Cada vez suma el peso a todos, elige al de más crédito y le resta el total.
-- Con todos los pesos en 1 es un round-robin común.
-- =====================================================================
create function private.assign_sdr(p_lead uuid, p_launch text, p_motivo text)
returns uuid language plpgsql set search_path = '' as $$
declare
  v_current uuid;
  v_total int;
  v_rep public.sales_reps;
begin
  select sdr_id into v_current from public.leads where id = p_lead for update;
  if v_current is not null then
    return v_current;
  end if;

  perform 1 from public.sales_reps where sdr_status = 'activo' order by id for update;
  select coalesce(sum(sdr_weight), 0) into v_total from public.sales_reps where sdr_status = 'activo';
  if v_total = 0 then
    return null; -- sin SDR activos: el lead queda sin asignar
  end if;

  update public.sales_reps set rr_credit = rr_credit + sdr_weight where sdr_status = 'activo';
  select * into v_rep from public.sales_reps where sdr_status = 'activo' order by rr_credit desc, created_at, id limit 1;
  update public.sales_reps set rr_credit = rr_credit - v_total where id = v_rep.id;

  update public.leads set sdr_id = v_rep.id, updated_at = now() where id = p_lead;
  insert into public.lead_events (lead_id, launch_id, kind, summary, data)
  values (p_lead, p_launch, 'sdr', 'Asignado a ' || v_rep.name || ' (' || p_motivo || ')', jsonb_build_object('sdr_id', v_rep.id));
  return v_rep.id;
end;
$$;

-- WhatsApp al que /aplicacion manda al lead: el de su SDR o el de por defecto.
create function private.lead_whatsapp(p_sdr uuid, out sdr_name text, out wa text)
language plpgsql stable set search_path = '' as $$
declare
  r public.sales_reps;
begin
  select * into r from public.sales_reps where id = p_sdr;
  if r.id is not null and r.sdr_status in ('activo', 'pausado') and r.whatsapp_url <> '' then
    sdr_name := r.name;
    wa := r.whatsapp_url;
  else
    sdr_name := '';
    select default_whatsapp_url into wa from public.crm_settings;
    wa := coalesce(wa, '');
  end if;
end;
$$;

-- =====================================================================
-- Ingesta: optin asigna SDR solo a los calificados; aplicación al resto.
-- =====================================================================

create or replace function public.ingest_optin(p jsonb)
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

  if cal then
    perform private.assign_sdr(v_lead, launch, 'optin calificado');
  end if;

  perform private.apply_pending(v_lead, e, ph);

  return jsonb_build_object('ok', true, 'id', v_lead, 'repetido', v_existed);
end;
$$;

create or replace function public.ingest_aplicacion(p jsonb)
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
  v_sdr uuid;
  v_sdr_name text := '';
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

  if not rechazado then
    v_sdr := private.assign_sdr(v_lead, launch, 'aplicó');
    select w.sdr_name, w.wa into v_sdr_name, v_wa from private.lead_whatsapp(v_sdr) w;
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

  resumen := 'Aplicó post-clase'
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
$$;

-- =====================================================================
-- Acciones del equipo (las llama el navegador; validan permisos adentro)
-- =====================================================================

-- Datos de quién llama: perfil, nombre y si es admin / SDR / closer del lead.
create function private.actor_name()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select name from public.sales_reps where profile_id = (select auth.uid())),
    (select nullif(full_name, '') from public.profiles where id = (select auth.uid())),
    (select email from public.profiles where id = (select auth.uid())),
    'Sistema'
  );
$$;

create function private.log_event(p_lead uuid, p_launch text, p_kind text, p_summary text, p_data jsonb default '{}'::jsonb)
returns void language sql set search_path = '' as $$
  insert into public.lead_events (lead_id, launch_id, kind, summary, data, created_by, created_by_name)
  values (p_lead, p_launch, p_kind, p_summary, p_data, (select auth.uid()), private.actor_name());
$$;

create function private.is_lead_sdr(p_lead uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leads where id = p_lead and sdr_id is not null and sdr_id = private.my_sdr_id());
$$;

create function private.is_lead_closer(p_lead uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sales_calls c join public.lead_launches ll on ll.id = c.lead_launch_id
    where ll.lead_id = p_lead and c.status <> 'cancelada' and c.closer_id is not null and c.closer_id = private.my_closer_id()
  );
$$;

-- Cambio de estado post-clase. "Agendado" se hace con crm_schedule_call y la venta con
-- crm_record_call_result. A "Cliente" lo pasan el closer o el admin.
create function public.crm_set_status(p_lead_launch uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches;
  is_admin boolean := private.is_superadmin();
  allowed text[];
begin
  select * into ll from public.lead_launches where id = p_lead_launch for update;
  if ll.id is null then raise exception 'Lead no encontrado'; end if;

  allowed := case
    when is_admin then array['Nuevo lead', 'No atendió', 'No se cerró', 'Cliente · falta onboarding', 'Cliente']
    when private.is_lead_closer(ll.lead_id) then array['No se cerró', 'Cliente']
    when private.is_lead_sdr(ll.lead_id) then array['Nuevo lead', 'No atendió', 'No se cerró']
    else array[]::text[]
  end;
  if cardinality(allowed) = 0 then raise exception 'Sin permisos sobre este lead'; end if;
  if p_status = 'Agendado' then raise exception 'Para agendar elegí closer, fecha y hora'; end if;
  if not p_status = any (allowed) then raise exception 'No podés pasar el lead a "%"', p_status; end if;
  if ll.post_class_status is not distinct from p_status and p_status <> 'No atendió' then return; end if;

  update public.lead_launches set
    post_class_status = p_status,
    contact_attempts = contact_attempts + case when p_status = 'No atendió' then 1 else 0 end,
    updated_at = now()
  where id = p_lead_launch;

  perform private.log_event(ll.lead_id, ll.launch_id, 'estado',
    'Estado: ' || coalesce(ll.post_class_status, 'sin estado') || ' → ' || p_status
      || case when p_status = 'No atendió' then ' (intento ' || (ll.contact_attempts + 1) || ')' else '' end
      || coalesce(E'\n' || nullif(trim(p_note), ''), ''),
    jsonb_build_object('from', ll.post_class_status, 'to', p_status));
end;
$$;

create function public.crm_add_note(p_lead_launch uuid, p_text text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches;
begin
  select * into ll from public.lead_launches where id = p_lead_launch;
  if ll.id is null or not private.can_see_lead(ll.lead_id) then raise exception 'Sin permisos sobre este lead'; end if;
  if trim(coalesce(p_text, '')) = '' then raise exception 'La nota está vacía'; end if;
  perform private.log_event(ll.lead_id, ll.launch_id, 'nota', trim(p_text));
end;
$$;

create function public.crm_set_next_action(p_lead_launch uuid, p_text text, p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches;
begin
  select * into ll from public.lead_launches where id = p_lead_launch for update;
  if ll.id is null or not private.can_see_lead(ll.lead_id) then raise exception 'Sin permisos sobre este lead'; end if;
  update public.lead_launches
  set next_action = nullif(trim(coalesce(p_text, '')), ''), next_action_at = p_at, updated_at = now()
  where id = p_lead_launch;
  perform private.log_event(ll.lead_id, ll.launch_id, 'tarea',
    case when p_at is null and nullif(trim(coalesce(p_text, '')), '') is null then 'Quitó la próxima tarea'
         else 'Próxima tarea: ' || coalesce(nullif(trim(p_text), ''), '—')
              || coalesce(' · ' || to_char(p_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'), '') end);
end;
$$;

-- Pasa el lead a "Agendado" con closer, fecha y hora. Cancela llamadas abiertas anteriores.
create function public.crm_schedule_call(p_lead_launch uuid, p_closer uuid, p_at timestamptz, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches;
  c public.sales_reps;
  v_call uuid;
begin
  select * into ll from public.lead_launches where id = p_lead_launch for update;
  if ll.id is null then raise exception 'Lead no encontrado'; end if;
  if not (private.is_superadmin() or private.is_lead_sdr(ll.lead_id)) then raise exception 'Sin permisos sobre este lead'; end if;
  select * into c from public.sales_reps where id = p_closer;
  if c.id is null or c.closer_status is distinct from 'activo' then raise exception 'Elegí un closer activo'; end if;
  if p_at is null then raise exception 'Falta la fecha y hora de la llamada'; end if;

  update public.sales_calls set status = 'cancelada', updated_at = now()
  where lead_launch_id = p_lead_launch and status = 'agendada';

  insert into public.sales_calls (lead_launch_id, closer_id, scheduled_at, scheduled_by, scheduled_by_name, sdr_note)
  values (p_lead_launch, p_closer, p_at, (select auth.uid()), private.actor_name(), nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_call;

  update public.lead_launches set post_class_status = 'Agendado', closer_id = p_closer, updated_at = now()
  where id = p_lead_launch;

  perform private.log_event(ll.lead_id, ll.launch_id, 'agenda',
    'Agendó llamada con ' || c.name || ' para el ' || to_char(p_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI')
      || coalesce(E'\n' || nullif(trim(p_note), ''), ''),
    jsonb_build_object('call_id', v_call, 'closer_id', p_closer, 'from', ll.post_class_status));
  return v_call;
end;
$$;

create function public.crm_reschedule_call(p_call uuid, p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.sales_calls;
  ll public.lead_launches;
begin
  select * into c from public.sales_calls where id = p_call for update;
  if c.id is null or c.status <> 'agendada' then raise exception 'La llamada no está agendada'; end if;
  select * into ll from public.lead_launches where id = c.lead_launch_id;
  if not (private.is_superadmin() or private.is_lead_sdr(ll.lead_id)
          or (c.closer_id is not null and c.closer_id = private.my_closer_id())) then
    raise exception 'Sin permisos sobre esta llamada';
  end if;
  if p_at is null then raise exception 'Falta la fecha y hora'; end if;
  update public.sales_calls set scheduled_at = p_at, updated_at = now() where id = p_call;
  perform private.log_event(ll.lead_id, ll.launch_id, 'agenda',
    'Reprogramó la llamada: ' || to_char(c.scheduled_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI')
      || ' → ' || to_char(p_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'),
    jsonb_build_object('call_id', p_call));
end;
$$;

-- Resultado de la llamada. Si cerró: crea el cliente en Clientes y pagos (o usa el
-- existente con el mismo email o teléfono) y registra lo cobrado como pago.
create function public.crm_record_call_result(
  p_call uuid, p_result text, p_note text default null,
  p_amount_total numeric default null, p_amount_collected numeric default null,
  p_currency text default 'USD', p_payment_method text default null, p_receipt_path text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.sales_calls;
  ll public.lead_launches;
  l public.leads;
  closer_name text;
  v_client uuid;
  v_payment uuid;
  v_new_client boolean := false;
  v_status text;
  cur text := upper(coalesce(nullif(trim(p_currency), ''), 'USD'));
begin
  select * into c from public.sales_calls where id = p_call for update;
  if c.id is null then raise exception 'Llamada no encontrada'; end if;
  if not (private.is_superadmin() or (c.closer_id is not null and c.closer_id = private.my_closer_id())) then
    raise exception 'Sin permisos sobre esta llamada';
  end if;
  if c.status = 'cancelada' then raise exception 'La llamada fue cancelada'; end if;
  if c.result is not null then raise exception 'La llamada ya tiene resultado'; end if;
  if p_result not in ('no_cerro', 'cerro') then raise exception 'Resultado inválido'; end if;

  select * into ll from public.lead_launches where id = c.lead_launch_id for update;
  select * into l from public.leads where id = ll.lead_id;
  select name into closer_name from public.sales_reps where id = c.closer_id;

  if p_result = 'cerro' then
    if coalesce(p_amount_total, 0) <= 0 then raise exception 'Falta el monto del programa'; end if;
    if coalesce(p_amount_collected, 0) < 0 then raise exception 'El monto cobrado no puede ser negativo'; end if;

    select id into v_client from public.clients
    where (l.email is not null and lower(email) = l.email)
       or (l.phone is not null and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = l.phone)
    order by created_at limit 1;

    if v_client is null then
      insert into public.clients (full_name, email, phone, status, start_date, total_amount, currency, installments_count, notes)
      values (coalesce(nullif(l.full_name, ''), l.email, '+' || l.phone), l.email, case when l.phone is not null then '+' || l.phone end,
              'activo', current_date, p_amount_total, cur, 1,
              'Venta del CRM · ' || ll.launch_id || ' · closer ' || coalesce(closer_name, '—'))
      returning id into v_client;
      v_new_client := true;
    end if;

    if coalesce(p_amount_collected, 0) > 0 then
      insert into public.payments (client_id, installment_number, amount, currency, due_date, paid_at, method, notes)
      values (v_client, case when v_new_client then 1 end, p_amount_collected, cur, current_date, current_date,
              nullif(trim(coalesce(p_payment_method, '')), ''),
              'Cobrado en la llamada · ' || ll.launch_id || ' · closer ' || coalesce(closer_name, '—')
                || case when p_receipt_path is not null then ' · comprobante en el CRM' else '' end)
      returning id into v_payment;
    end if;
    v_status := 'Cliente · falta onboarding';
  else
    v_status := 'No se cerró';
  end if;

  update public.sales_calls set
    status = 'realizada', result = p_result, result_note = nullif(trim(coalesce(p_note, '')), ''),
    amount_total = case when p_result = 'cerro' then p_amount_total end,
    amount_collected = case when p_result = 'cerro' then coalesce(p_amount_collected, 0) end,
    currency = cur, payment_method = nullif(trim(coalesce(p_payment_method, '')), ''),
    receipt_path = p_receipt_path, client_id = v_client, payment_id = v_payment,
    closed_at = now(), updated_at = now()
  where id = p_call;

  update public.lead_launches set post_class_status = v_status, updated_at = now() where id = ll.id;

  perform private.log_event(ll.lead_id, ll.launch_id, 'resultado',
    case when p_result = 'cerro'
      then 'Cerró la venta: ' || cur || ' ' || p_amount_total || ' (cobrado ' || coalesce(p_amount_collected, 0)
           || coalesce(', ' || nullif(trim(p_payment_method), ''), '') || ')'
           || case when v_new_client then ' · cliente creado en Clientes y pagos' else ' · pago sumado al cliente existente' end
      else 'No se cerró' end
      || coalesce(E'\n' || nullif(trim(p_note), ''), ''),
    jsonb_build_object('call_id', p_call, 'client_id', v_client, 'payment_id', v_payment, 'from', ll.post_class_status));

  return jsonb_build_object('client_id', v_client, 'payment_id', v_payment, 'new_client', v_new_client);
end;
$$;

-- ---------- Solo admin ----------
create function public.crm_reassign_sdr(p_lead uuid, p_sdr uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
  r public.sales_reps;
begin
  if not private.is_superadmin() then raise exception 'Solo el admin puede reasignar'; end if;
  select * into l from public.leads where id = p_lead for update;
  if l.id is null then raise exception 'Lead no encontrado'; end if;
  if p_sdr is not null then
    select * into r from public.sales_reps where id = p_sdr;
    if r.id is null or r.sdr_status is null or r.sdr_status = 'baja' then raise exception 'Elegí un SDR del equipo'; end if;
  end if;
  if l.sdr_id is not distinct from p_sdr then return; end if;
  update public.leads set sdr_id = p_sdr, updated_at = now() where id = p_lead;
  perform private.log_event(p_lead, private.current_launch(), 'sdr',
    case when p_sdr is null then 'Quedó sin SDR asignado' else 'Reasignado a ' || r.name end,
    jsonb_build_object('from', l.sdr_id, 'to', p_sdr));
end;
$$;

-- Reparte entre los SDR activos los leads sin SDR del lanzamiento que califican o aplicaron.
-- Con p_from_rep, en cambio, reparte los leads abiertos de ese SDR (para cuando se da de baja).
create function public.crm_distribute(p_launch text, p_from_rep uuid default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_lead uuid;
  n int := 0;
  motivo text := case when p_from_rep is null then 'reparto de leads sin asignar' else 'reparto por baja de SDR' end;
begin
  if not private.is_superadmin() then raise exception 'Solo el admin puede repartir leads'; end if;
  if not exists (select 1 from public.sales_reps where sdr_status = 'activo') then
    raise exception 'No hay SDR activos';
  end if;
  for v_lead in
    select l.id from public.leads l
    where (
      p_from_rep is null and l.sdr_id is null and exists (
        select 1 from public.lead_launches ll where ll.lead_id = l.id and ll.launch_id = p_launch
          and (ll.califica or (ll.applied_at is not null and ll.route = 'aplicado'))
      )
    ) or (
      p_from_rep is not null and l.sdr_id = p_from_rep and not exists (
        select 1 from public.lead_launches ll where ll.lead_id = l.id
          and ll.post_class_status in ('Cliente · falta onboarding', 'Cliente')
      )
    )
    order by l.created_at
  loop
    if p_from_rep is not null then
      update public.leads set sdr_id = null where id = v_lead;
    end if;
    perform private.assign_sdr(v_lead, coalesce(p_launch, private.current_launch()), motivo);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create function public.crm_reassign_call(p_call uuid, p_closer uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.sales_calls;
  r public.sales_reps;
  ll public.lead_launches;
begin
  if not private.is_superadmin() then raise exception 'Solo el admin puede reasignar llamadas'; end if;
  select * into c from public.sales_calls where id = p_call for update;
  if c.id is null or c.status <> 'agendada' then raise exception 'La llamada no está agendada'; end if;
  select * into r from public.sales_reps where id = p_closer;
  if r.id is null or r.closer_status is distinct from 'activo' then raise exception 'Elegí un closer activo'; end if;
  select * into ll from public.lead_launches where id = c.lead_launch_id;
  update public.sales_calls set closer_id = p_closer, updated_at = now() where id = p_call;
  update public.lead_launches set closer_id = p_closer, updated_at = now() where id = ll.id;
  perform private.log_event(ll.lead_id, ll.launch_id, 'agenda', 'Llamada reasignada a ' || r.name, jsonb_build_object('call_id', p_call));
end;
$$;

-- ---------- Grants ----------
revoke execute on function public.crm_set_status(uuid, text, text) from public, anon;
revoke execute on function public.crm_add_note(uuid, text) from public, anon;
revoke execute on function public.crm_set_next_action(uuid, text, timestamptz) from public, anon;
revoke execute on function public.crm_schedule_call(uuid, uuid, timestamptz, text) from public, anon;
revoke execute on function public.crm_reschedule_call(uuid, timestamptz) from public, anon;
revoke execute on function public.crm_record_call_result(uuid, text, text, numeric, numeric, text, text, text) from public, anon;
revoke execute on function public.crm_reassign_sdr(uuid, uuid) from public, anon;
revoke execute on function public.crm_distribute(text, uuid) from public, anon;
revoke execute on function public.crm_reassign_call(uuid, uuid) from public, anon;
grant execute on function public.crm_set_status(uuid, text, text) to authenticated;
grant execute on function public.crm_add_note(uuid, text) to authenticated;
grant execute on function public.crm_set_next_action(uuid, text, timestamptz) to authenticated;
grant execute on function public.crm_schedule_call(uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.crm_reschedule_call(uuid, timestamptz) to authenticated;
grant execute on function public.crm_record_call_result(uuid, text, text, numeric, numeric, text, text, text) to authenticated;
grant execute on function public.crm_reassign_sdr(uuid, uuid) to authenticated;
grant execute on function public.crm_distribute(text, uuid) to authenticated;
grant execute on function public.crm_reassign_call(uuid, uuid) to authenticated;

-- Los helpers de permisos los evalúan las políticas RLS (authenticated); el resto, solo el dueño.
revoke execute on function private.assign_sdr(uuid, text, text) from public;
revoke execute on function private.lead_whatsapp(uuid) from public;
revoke execute on function private.log_event(uuid, text, text, text, jsonb) from public;
revoke execute on function private.actor_name() from public;
revoke execute on function private.my_sdr_id() from public, anon;
revoke execute on function private.my_closer_id() from public, anon;
revoke execute on function private.can_see_lead(uuid) from public, anon;
revoke execute on function private.can_see_call(uuid) from public, anon;
revoke execute on function private.is_lead_sdr(uuid) from public, anon;
revoke execute on function private.is_lead_closer(uuid) from public, anon;
revoke execute on function private.can_upload_receipt(text) from public, anon;
revoke execute on function private.can_read_receipt(text) from public, anon;
grant execute on function private.my_sdr_id() to authenticated;
grant execute on function private.my_closer_id() to authenticated;
grant execute on function private.can_see_lead(uuid) to authenticated;
grant execute on function private.can_see_call(uuid) to authenticated;
grant execute on function private.can_upload_receipt(text) to authenticated;
grant execute on function private.can_read_receipt(text) to authenticated;
