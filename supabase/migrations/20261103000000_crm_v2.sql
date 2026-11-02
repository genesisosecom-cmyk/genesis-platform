-- =====================================================================
-- CRM v2: bolsa de leads, trabajo del SDR con seguimientos por cadencia,
-- asistencia y cobro en varios pagos y cuotas para el closer, comisiones,
-- agentes, recursos y metas por lanzamiento.
-- Extiende el CRM anterior (sales_reps, sales_calls, crm_*).
-- =====================================================================

-- ---------- Configuración ----------
alter table public.crm_settings
  add column assignment_mode text not null default 'bolsa' check (assignment_mode in ('bolsa', 'ronda')),
  add column sdr_commission_pct numeric(5, 2) not null default 3 check (sdr_commission_pct between 0 and 100),
  add column closer_commission_pct numeric(5, 2) not null default 7 check (closer_commission_pct between 0 and 100);

-- El equipo lee la configuración (comisiones para el simulador).
create policy "crm_settings: el equipo lee" on public.crm_settings
  for select to authenticated using ((select private.my_sdr_id()) is not null or (select private.my_closer_id()) is not null);

-- ---------- Metas por lanzamiento ----------
alter table public.launches
  add column cash_goal numeric(12, 2),
  add column daily_cash_goal numeric(12, 2),
  add column sales_close_at date;

-- ---------- Trabajo del SDR sobre el lead ----------
-- contact_attempts pasa a ser la cantidad de dials.
alter table public.lead_launches
  add column answered boolean,                  -- ¿contestó?
  add column real_conversation boolean,         -- ¿hubo conversación real?
  add column sdr_qualified boolean,             -- ¿califica de verdad? (criterio del SDR)
  add column readiness text check (readiness in ('listo', 'nutricion')),
  add column agendo boolean,                    -- false = calificó y no agendó
  add column followup_cadence text check (followup_cadence in ('intensa', 'normal', 'espaciada', 'ninguna')),
  add column followup_started_at timestamptz,
  add column followup_step int not null default 0,
  add column next_followup_at timestamptz,
  add column finalized_reason text,
  add column finalized_at timestamptz,
  add column finalized_by_name text,
  add column no_cuenta_reason text,
  add column sdr_notes text,
  add column asked_agents boolean not null default false, -- lo marca el SDR
  add column agents_sent jsonb not null default '[]'::jsonb;
create index lead_launches_followup_idx on public.lead_launches (next_followup_at) where next_followup_at is not null;

-- ---------- Calls: SDR que agendó, asistencia, seguimiento del closer ----------
alter table public.sales_calls drop constraint sales_calls_result_check;
alter table public.sales_calls add constraint sales_calls_result_check check (result in ('no_cerro', 'cerro', 'seguimiento'));
alter table public.sales_calls
  add column sdr_id uuid references public.sales_reps (id) on delete set null, -- SDR que cobra comisión por esta agenda
  add column attendance text check (attendance in ('se_presento', 'no_show', 'cancelo')),
  add column closer_followup_at timestamptz,
  add column program text;
create index sales_calls_sdr_idx on public.sales_calls (sdr_id);

-- ---------- Pagos de las ventas (en Clientes y pagos) ----------
alter table public.payments
  add column sales_call_id uuid references public.sales_calls (id) on delete set null,
  add column receipt_path text;
create index payments_sales_call_idx on public.payments (sales_call_id);

-- ---------- Agentes y recursos ----------
create table public.crm_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  message text not null default '',  -- texto que se suma al mensaje para el lead
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.crm_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'link' check (kind in ('link', 'guion')),
  url text,
  body text,
  audience text not null default 'todos' check (audience in ('todos', 'sdr', 'closer')),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.crm_agents enable row level security;
alter table public.crm_resources enable row level security;
create policy "crm_agents: solo admin" on public.crm_agents
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "crm_agents: el equipo lee los activos" on public.crm_agents
  for select to authenticated using (active and ((select private.my_sdr_id()) is not null or (select private.my_closer_id()) is not null));
create policy "crm_resources: solo admin" on public.crm_resources
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "crm_resources: el equipo lee los activos" on public.crm_resources
  for select to authenticated using (active and ((select private.my_sdr_id()) is not null or (select private.my_closer_id()) is not null));

-- ---------- Visibilidad: el equipo ve todos los leads (Míos / Todo el equipo) ----------
-- Editar sigue limitado: cada acción crm_* valida que el lead sea suyo (o de la bolsa).
create or replace function private.can_see_lead(p_lead uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_superadmin() or private.my_sdr_id() is not null or private.my_closer_id() is not null;
$$;

-- Pagos: el closer y el SDR de la venta (o el admin, por la política existente).
create function private.can_see_sale(p_call uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sales_calls
    where id = p_call
      and ((closer_id is not null and closer_id = private.my_closer_id()) or (sdr_id is not null and sdr_id = private.my_sdr_id()))
  );
$$;
revoke execute on function private.can_see_sale(uuid) from public, anon;
grant execute on function private.can_see_sale(uuid) to authenticated;
create policy "payments: el equipo ve los de sus ventas" on public.payments
  for select to authenticated using (sales_call_id is not null and private.can_see_sale(sales_call_id));

-- Comprobantes: además de la ruta <call_id>/…, los pagos guardan los suyos ahí mismo.
create or replace function private.can_upload_receipt(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_superadmin() or exists (
    select 1 from public.sales_calls
    where id::text = split_part(p_path, '/', 1) and closer_id is not null and closer_id = private.my_closer_id()
  );
$$;

-- =====================================================================
-- Seguimientos por cadencia (horas desde que entra en seguimiento)
-- =====================================================================
create function private.cadence_hours(c text)
returns int[] language sql immutable set search_path = '' as $$
  select case c
    -- 2 h, 6 h, 12 h y 24 h; todos los días hasta el día 14; 2 por semana hasta el mes; 1 por semana hasta los 3 meses
    when 'intensa' then array[2, 6, 12, 24]
      || array(select d * 24 from generate_series(2, 14) d)
      || array[420, 504, 588, 672]
      || array(select d * 24 from generate_series(35, 84, 7) d)
    -- 4 h, 12 h, 24 h y 48 h; 1 por día hasta la semana; 1 por semana hasta los 3 meses
    when 'normal' then array[4, 12, 24, 48]
      || array(select d * 24 from generate_series(3, 7) d)
      || array(select d * 24 from generate_series(14, 84, 7) d)
    -- 1 cada 2 semanas durante 3 meses
    when 'espaciada' then array(select d * 24 from generate_series(14, 84, 14) d)
    else array[]::int[]
  end;
$$;

-- El lead va a seguimiento si está asignado, no agendó, no está finalizado ni "no cuenta",
-- y no contestó, no califica, no está listo (nutrición) o calificó y no agendó.
create function private.needs_followup(ll public.lead_launches)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.leads where id = ll.lead_id and sdr_id is not null)
    and ll.agendo is distinct from true and ll.finalized_at is null and ll.no_cuenta_reason is null
    and (ll.answered = false or ll.agendo = false or ll.sdr_qualified = false or ll.readiness = 'nutricion');
$$;

-- Recalcula el seguimiento y el estado post-clase después de cada cambio del SDR.
create function private.sync_lead(p_ll uuid)
returns void language plpgsql set search_path = '' as $$
declare
  ll public.lead_launches;
  hrs int[];
  sale_states text[] := array['Agendado', 'Cliente · falta onboarding', 'Cliente'];
begin
  select * into ll from public.lead_launches where id = p_ll for update;

  if private.needs_followup(ll) then
    if ll.followup_started_at is null then
      ll.followup_started_at := now();
      ll.followup_step := 0;
      ll.followup_cadence := coalesce(ll.followup_cadence, 'normal');
    end if;
    hrs := private.cadence_hours(ll.followup_cadence);
    ll.next_followup_at := case when ll.followup_step < coalesce(array_length(hrs, 1), 0)
      then ll.followup_started_at + make_interval(hours => hrs[ll.followup_step + 1]) end;
  else
    ll.next_followup_at := null;
  end if;

  update public.lead_launches set
    followup_started_at = ll.followup_started_at,
    followup_step = ll.followup_step,
    followup_cadence = ll.followup_cadence,
    next_followup_at = ll.next_followup_at,
    post_class_status = case
      when post_class_status = any (sale_states) then post_class_status
      when ll.finalized_at is not null then 'No se cerró'
      when ll.contact_attempts > 0 and ll.answered is distinct from true then 'No atendió'
      when post_class_status = 'No atendió' and ll.answered = true then 'Nuevo lead'
      when post_class_status = 'No se cerró' and ll.finalized_at is null then 'Nuevo lead'
      when post_class_status is null and exists (select 1 from public.leads where id = ll.lead_id and sdr_id is not null) then 'Nuevo lead'
      else post_class_status
    end,
    updated_at = now()
  where id = p_ll;
end;
$$;

-- =====================================================================
-- Ingesta: el reparto automático solo corre en modo "ronda"
-- =====================================================================
create function private.auto_assign_enabled()
returns boolean language sql stable set search_path = '' as $$
  select coalesce((select assignment_mode = 'ronda' from public.crm_settings), false);
$$;

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

  if cal and private.auto_assign_enabled() then
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
-- Acciones del SDR
-- =====================================================================

-- Lead del SDR que llama (o cualquiera para el admin). Devuelve la fila con lock.
create function private.my_lead_launch(p_ll uuid)
returns public.lead_launches language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches;
begin
  select * into ll from public.lead_launches where id = p_ll for update;
  if ll.id is null then raise exception 'Lead no encontrado'; end if;
  if not (private.is_superadmin() or private.is_lead_sdr(ll.lead_id)) then
    raise exception 'Este lead no es tuyo. Tomalo desde "Por asignar" para trabajarlo.';
  end if;
  return ll;
end;
$$;

-- Tomar un lead de la bolsa. Atómico: si otro lo tomó antes, avisa quién.
create function public.crm_claim(p_ll uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.my_sdr_id();
  ll public.lead_launches;
  l public.leads;
  owner text;
begin
  if me is null or (select sdr_status from public.sales_reps where id = me) <> 'activo' then
    raise exception 'Solo un SDR activo puede tomar leads';
  end if;
  select * into ll from public.lead_launches where id = p_ll;
  if ll.id is null then raise exception 'Lead no encontrado'; end if;
  if ll.no_cuenta_reason is not null then raise exception 'Este lead está en "No cuentan"'; end if;
  select * into l from public.leads where id = ll.lead_id for update;
  if l.sdr_id = me then return; end if;
  if l.sdr_id is not null then
    select name into owner from public.sales_reps where id = l.sdr_id;
    raise exception 'Ya lo tomó %', coalesce(owner, 'otro SDR');
  end if;
  update public.leads set sdr_id = me, updated_at = now() where id = l.id;
  perform private.log_event(l.id, ll.launch_id, 'sdr', 'Se asignó el lead (lo tomó de la bolsa)', jsonb_build_object('sdr_id', me));
  perform private.sync_lead(p_ll);
end;
$$;

-- Liberar: el lead vuelve a "Por asignar".
create function public.crm_release(p_ll uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches := private.my_lead_launch(p_ll);
begin
  update public.leads set sdr_id = null, updated_at = now() where id = ll.lead_id;
  update public.lead_launches set next_followup_at = null where id = p_ll;
  perform private.log_event(ll.lead_id, ll.launch_id, 'sdr', 'Liberó el lead: volvió a "Por asignar"');
end;
$$;

create function public.crm_dial(p_ll uuid, p_delta int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches := private.my_lead_launch(p_ll);
  n int := greatest(0, ll.contact_attempts + case when p_delta >= 0 then 1 else -1 end);
begin
  if n = ll.contact_attempts then return n; end if;
  update public.lead_launches set contact_attempts = n, updated_at = now() where id = p_ll;
  perform private.log_event(ll.lead_id, ll.launch_id, 'dial',
    case when p_delta >= 0 then 'Dial ' || n else 'Corrigió los dials: ' || n end, jsonb_build_object('dials', n));
  perform private.sync_lead(p_ll);
  return n;
end;
$$;

-- Guarda los campos del bloque de contacto. Cada cambio queda en el historial.
create function public.crm_update_lead(p_ll uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches := private.my_lead_launch(p_ll);
  k text;
  yn text;
  changes text[] := array[]::text[];
  lbl jsonb := '{"answered": "¿Contestó?", "real_conversation": "¿Conversación real?", "sdr_qualified": "¿Califica de verdad?"}';
  cad jsonb := '{"intensa": "Más seguido", "normal": "Como acordamos", "espaciada": "Más espaciado", "ninguna": "No hacer seguimiento"}';
begin
  for k in select jsonb_object_keys(p) loop
    if k in ('answered', 'real_conversation', 'sdr_qualified') then
      yn := case when p ->> k is null then '—' when (p ->> k)::boolean then 'Sí' else 'No' end;
      execute format('update public.lead_launches set %I = $1 where id = $2', k) using (p ->> k)::boolean, p_ll;
      changes := changes || ((lbl ->> k) || ' ' || yn);
    elsif k = 'readiness' then
      update public.lead_launches set readiness = p ->> k where id = p_ll;
      changes := changes || case p ->> k when 'listo' then 'Listo para agendar' when 'nutricion' then 'Todavía no está listo (nutrición)' else 'Sin definir si está listo' end;
    elsif k = 'agendo' then
      update public.lead_launches set agendo = (p ->> k)::boolean where id = p_ll;
      if (p ->> k)::boolean is false then changes := changes || 'Calificó y no agendó'::text; end if;
    elsif k = 'followup_cadence' then
      if p ->> k not in ('intensa', 'normal', 'espaciada', 'ninguna') then raise exception 'Cadencia inválida'; end if;
      update public.lead_launches set followup_cadence = p ->> k where id = p_ll;
      changes := changes || ('Seguimiento: ' || (cad ->> (p ->> k)));
      if p ->> k = 'ninguna' then
        update public.lead_launches set finalized_reason = 'Sin seguimiento', finalized_at = now(), finalized_by_name = private.actor_name()
        where id = p_ll and finalized_at is null;
      end if;
    elsif k = 'sdr_notes' then
      update public.lead_launches set sdr_notes = nullif(trim(p ->> k), '') where id = p_ll;
      changes := changes || ('Notas: ' || coalesce(nullif(trim(p ->> k), ''), '(vacías)'));
    elsif k = 'asked_agents' then
      update public.lead_launches set asked_agents = coalesce((p ->> k)::boolean, false) where id = p_ll;
      changes := changes || case when (p ->> k)::boolean then 'Marcó que pidió los agentes' else 'Quitó "pidió agentes"' end;
    else
      raise exception 'Campo no editable: %', k;
    end if;
  end loop;
  if cardinality(changes) > 0 then
    perform private.log_event(ll.lead_id, ll.launch_id, 'contacto', array_to_string(changes, ' · '), p);
  end if;
  perform private.sync_lead(p_ll);
end;
$$;

-- Registra un seguimiento hecho: avanza la cadencia. Al terminarla, finaliza.
create function public.crm_followup_done(p_ll uuid, p_responded boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches := private.my_lead_launch(p_ll);
  total int := coalesce(array_length(private.cadence_hours(ll.followup_cadence), 1), 0);
begin
  if ll.followup_started_at is null then raise exception 'El lead no está en seguimiento'; end if;
  update public.lead_launches set followup_step = followup_step + 1,
    answered = case when p_responded then true else answered end
  where id = p_ll;
  perform private.log_event(ll.lead_id, ll.launch_id, 'seguimiento',
    'Seguimiento ' || (ll.followup_step + 1) || ' de ' || total || ': ' || case when p_responded then 'respondió' else 'no respondió' end
      || coalesce(E'\n' || nullif(trim(p_note), ''), ''));
  if ll.followup_step + 1 >= total and not p_responded then
    update public.lead_launches set finalized_reason = 'No contestó tras la cadencia', finalized_at = now(), finalized_by_name = private.actor_name()
    where id = p_ll;
    perform private.log_event(ll.lead_id, ll.launch_id, 'final', 'Finalizado: terminó la cadencia sin respuesta');
  end if;
  perform private.sync_lead(p_ll);
end;
$$;

create function public.crm_finalize(p_ll uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches := private.my_lead_launch(p_ll);
begin
  if p_reason not in ('No contestó tras la cadencia', 'Número equivocado', 'No le interesa', 'No califica', 'Descalificado',
                      'Pidió que lo contacten más adelante', 'Ya está en otro programa') then
    raise exception 'Motivo inválido';
  end if;
  update public.lead_launches set finalized_reason = p_reason, finalized_at = now(), finalized_by_name = private.actor_name()
  where id = p_ll;
  perform private.log_event(ll.lead_id, ll.launch_id, 'final', 'Finalizado: ' || p_reason);
  perform private.sync_lead(p_ll);
end;
$$;

create function public.crm_reopen(p_ll uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches := private.my_lead_launch(p_ll);
begin
  update public.lead_launches set finalized_reason = null, finalized_at = null, finalized_by_name = null,
    followup_cadence = case when followup_cadence = 'ninguna' then 'normal' else followup_cadence end,
    followup_started_at = null, followup_step = 0
  where id = p_ll;
  perform private.log_event(ll.lead_id, ll.launch_id, 'final', 'Reabierto');
  perform private.sync_lead(p_ll);
end;
$$;

-- "No cuenta": duplicados, datos falsos, pruebas. Lo puede marcar el SDR del lead o cualquier SDR si no tiene dueño.
create function public.crm_set_no_cuenta(p_ll uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches;
  owner uuid;
begin
  select * into ll from public.lead_launches where id = p_ll for update;
  if ll.id is null then raise exception 'Lead no encontrado'; end if;
  select sdr_id into owner from public.leads where id = ll.lead_id;
  if not (private.is_superadmin() or (owner is null and private.my_sdr_id() is not null) or private.is_lead_sdr(ll.lead_id)) then
    raise exception 'Sin permisos sobre este lead';
  end if;
  update public.lead_launches set no_cuenta_reason = nullif(trim(coalesce(p_reason, '')), ''), next_followup_at = null where id = p_ll;
  perform private.log_event(ll.lead_id, ll.launch_id, 'no_cuenta',
    case when nullif(trim(coalesce(p_reason, '')), '') is null then 'Volvió a contar' else 'No cuenta: ' || trim(p_reason) end);
  perform private.sync_lead(p_ll);
end;
$$;

-- Agentes elegidos para el lead y enviados por WhatsApp o copiados.
create function public.crm_log_agents(p_ll uuid, p_agents uuid[], p_channel text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches;
  names text;
begin
  select * into ll from public.lead_launches where id = p_ll;
  if ll.id is null or not private.can_see_lead(ll.lead_id) then raise exception 'Sin permisos sobre este lead'; end if;
  if cardinality(p_agents) = 0 or cardinality(p_agents) > 3 then raise exception 'Elegí entre 1 y 3 agentes'; end if;
  select string_agg(name, ', ' order by sort, name) into names from public.crm_agents where id = any (p_agents);
  update public.lead_launches set agents_sent = agents_sent || jsonb_build_object(
    'agents', to_jsonb(p_agents), 'channel', p_channel, 'at', now(), 'by', private.actor_name())
  where id = p_ll;
  perform private.log_event(ll.lead_id, ll.launch_id, 'agentes',
    'Agentes ' || case when p_channel = 'whatsapp' then 'enviados por WhatsApp' else 'copiados' end || ': ' || coalesce(names, '—'));
end;
$$;

-- Carga manual: DM, referido, etc. Si ya existe, lo toma (si está libre) o avisa quién lo tiene.
create function public.crm_create_lead(
  p_name text, p_email text, p_phone text, p_inversion text, p_origin text,
  p_assign_me boolean default true, p_closer uuid default null, p_call_at timestamptz default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.my_sdr_id();
  e text := private.norm_email(p_email);
  ph text := private.norm_phone(p_phone);
  launch text := private.current_launch();
  v_lead uuid;
  v_existed boolean;
  v_ll uuid;
  owner uuid;
  owner_name text;
begin
  if not (private.is_superadmin() or me is not null or private.my_closer_id() is not null) then
    raise exception 'Sin permisos para cargar leads';
  end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'Falta el nombre'; end if;
  if e is null and ph is null then raise exception 'Cargá el mail o el WhatsApp'; end if;

  select u.lead_id, u.existed into v_lead, v_existed from private.upsert_lead(e, ph, trim(p_name), false) u;
  select sdr_id into owner from public.leads where id = v_lead;
  if v_existed and owner is not null and owner is distinct from me then
    select name into owner_name from public.sales_reps where id = owner;
    raise exception 'Ese lead ya existe y lo tiene %', coalesce(owner_name, 'otro SDR');
  end if;

  insert into public.lead_launches as ll (lead_id, launch_id, inversion_meta, califica, source, tracking)
  values (v_lead, launch, nullif(p_inversion, ''), private.califica(nullif(p_inversion, ''), null),
          'Carga manual · ' || coalesce(nullif(trim(p_origin), ''), 'sin origen'), jsonb_build_object('origen', p_origin))
  on conflict (lead_id, launch_id) do update set inversion_meta = coalesce(ll.inversion_meta, excluded.inversion_meta)
  returning id into v_ll;

  perform private.log_event(v_lead, launch, 'manual',
    'Cargado a mano' || coalesce(' · ' || nullif(trim(p_origin), ''), '') || coalesce(' · ' || nullif(p_inversion, ''), ''));

  if p_assign_me and me is not null and owner is null then
    update public.leads set sdr_id = me, updated_at = now() where id = v_lead;
    perform private.log_event(v_lead, launch, 'sdr', 'Se asignó el lead (carga manual)', jsonb_build_object('sdr_id', me));
  end if;
  perform private.sync_lead(v_ll);

  if p_closer is not null and p_call_at is not null then
    perform public.crm_schedule_call(v_ll, p_closer, p_call_at, null);
  end if;
  return v_ll;
end;
$$;

-- Agendar: ahora también puede el closer (a mano, para sí mismo). Guarda el SDR que cobra la agenda.
-- Los chequeos de permisos usan coalesce(…, false): si quien llama no es closer, my_closer_id()
-- es null y la comparación daría null, que en un "if not (…)" no dispara el error.
create or replace function public.crm_schedule_call(p_lead_launch uuid, p_closer uuid, p_at timestamptz, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches;
  c public.sales_reps;
  v_call uuid;
  v_sdr uuid;
begin
  select * into ll from public.lead_launches where id = p_lead_launch for update;
  if ll.id is null then raise exception 'Lead no encontrado'; end if;
  if not (private.is_superadmin() or private.is_lead_sdr(ll.lead_id)
          or coalesce(p_closer = private.my_closer_id(), false)) then
    raise exception 'Sin permisos sobre este lead';
  end if;
  select * into c from public.sales_reps where id = p_closer;
  if c.id is null or c.closer_status is distinct from 'activo' then raise exception 'Elegí un closer activo'; end if;
  if p_at is null then raise exception 'Falta la fecha y hora de la llamada'; end if;
  select sdr_id into v_sdr from public.leads where id = ll.lead_id;

  update public.sales_calls set status = 'cancelada', updated_at = now()
  where lead_launch_id = p_lead_launch and status = 'agendada';

  insert into public.sales_calls (lead_launch_id, closer_id, sdr_id, scheduled_at, scheduled_by, scheduled_by_name, sdr_note)
  values (p_lead_launch, p_closer, v_sdr, p_at, (select auth.uid()), private.actor_name(),
          coalesce(nullif(trim(coalesce(p_note, '')), ''), ll.sdr_notes))
  returning id into v_call;

  update public.lead_launches set post_class_status = 'Agendado', closer_id = p_closer, agendo = true,
    finalized_at = null, finalized_reason = null, next_followup_at = null, updated_at = now()
  where id = p_lead_launch;

  perform private.log_event(ll.lead_id, ll.launch_id, 'agenda',
    'Agendó call con ' || c.name || ' para el ' || to_char(p_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI')
      || coalesce(E'\n' || nullif(trim(p_note), ''), ''),
    jsonb_build_object('call_id', v_call, 'closer_id', p_closer, 'from', ll.post_class_status));
  return v_call;
end;
$$;

-- =====================================================================
-- Acciones del closer
-- =====================================================================
create function private.my_call(p_call uuid)
returns public.sales_calls language plpgsql security definer set search_path = '' as $$
declare
  c public.sales_calls;
begin
  select * into c from public.sales_calls where id = p_call for update;
  if c.id is null then raise exception 'Call no encontrada'; end if;
  if not (private.is_superadmin() or coalesce(c.closer_id = private.my_closer_id(), false)) then
    raise exception 'Esta call no es tuya';
  end if;
  if c.status = 'cancelada' then raise exception 'La call fue cancelada'; end if;
  return c;
end;
$$;

-- Asistencia. No-show o canceló: el lead vuelve al SDR como "calificó y no agendó" (salvo que se reagende).
create function public.crm_mark_attendance(p_call uuid, p_attendance text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.sales_calls := private.my_call(p_call);
  ll public.lead_launches;
  lbl text := case p_attendance when 'se_presento' then 'Se presentó' when 'no_show' then 'No-show' when 'cancelo' then 'Canceló' end;
begin
  if lbl is null then raise exception 'Asistencia inválida'; end if;
  select * into ll from public.lead_launches where id = c.lead_launch_id for update;
  update public.sales_calls set attendance = p_attendance,
    status = case when p_attendance = 'se_presento' then status else 'realizada' end, updated_at = now()
  where id = p_call;
  if p_attendance <> 'se_presento' then
    update public.lead_launches set agendo = false, post_class_status = 'Nuevo lead', updated_at = now() where id = ll.id;
    perform private.sync_lead(ll.id);
  end if;
  perform private.log_event(ll.lead_id, ll.launch_id, 'asistencia', 'Call: ' || lbl, jsonb_build_object('call_id', p_call));
end;
$$;

-- Reagendó: nueva fecha (la puede cambiar el closer, el SDR del lead o el admin).
create or replace function public.crm_reschedule_call(p_call uuid, p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.sales_calls;
  ll public.lead_launches;
begin
  select * into c from public.sales_calls where id = p_call for update;
  if c.id is null or c.status = 'cancelada' or c.result in ('cerro', 'no_cerro') then raise exception 'La call no se puede reagendar'; end if;
  select * into ll from public.lead_launches where id = c.lead_launch_id;
  if not (private.is_superadmin() or private.is_lead_sdr(ll.lead_id)
          or coalesce(c.closer_id = private.my_closer_id(), false)) then
    raise exception 'Sin permisos sobre esta call';
  end if;
  if p_at is null then raise exception 'Falta la fecha y hora'; end if;
  update public.sales_calls set scheduled_at = p_at, status = 'agendada', attendance = null, result = null,
    closer_followup_at = null, updated_at = now()
  where id = p_call;
  update public.lead_launches set agendo = true, post_class_status = 'Agendado', next_followup_at = null, updated_at = now()
  where id = ll.id;
  perform private.log_event(ll.lead_id, ll.launch_id, 'agenda',
    'Reagendó la call: ' || to_char(c.scheduled_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI')
      || ' → ' || to_char(p_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'),
    jsonb_build_object('call_id', p_call));
end;
$$;

-- Resultado: Venta (con pagos y cuotas), Seguimiento (con fecha) o No cerró.
-- p_payments: [{amount, method, paid_at, receipt_path}] · p_installments: [{amount, due_date}]
drop function public.crm_record_call_result(uuid, text, text, numeric, numeric, text, text, text);
create function public.crm_record_call_result(
  p_call uuid, p_result text, p_note text default null,
  p_program text default null, p_amount_total numeric default null, p_currency text default 'USD',
  p_payments jsonb default '[]'::jsonb, p_installments jsonb default '[]'::jsonb, p_followup_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.sales_calls := private.my_call(p_call);
  ll public.lead_launches;
  l public.leads;
  closer_name text;
  v_client uuid;
  v_new_client boolean := false;
  cur text := upper(coalesce(nullif(trim(p_currency), ''), 'USD'));
  pay jsonb;
  collected numeric := 0;
  n int := 0;
  methods text;
begin
  if c.result in ('cerro', 'no_cerro') then raise exception 'La call ya tiene resultado'; end if;
  if p_result not in ('cerro', 'no_cerro', 'seguimiento') then raise exception 'Resultado inválido'; end if;
  select * into ll from public.lead_launches where id = c.lead_launch_id for update;
  select * into l from public.leads where id = ll.lead_id;
  select name into closer_name from public.sales_reps where id = c.closer_id;

  if p_result = 'cerro' then
    if coalesce(p_amount_total, 0) <= 0 then raise exception 'Falta el monto de la venta'; end if;
    select id into v_client from public.clients
    where (l.email is not null and lower(email) = l.email)
       or (l.phone is not null and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = l.phone)
    order by created_at limit 1;
    if v_client is null then
      insert into public.clients (full_name, email, phone, program, status, start_date, total_amount, currency, installments_count, notes)
      values (coalesce(nullif(l.full_name, ''), l.email, '+' || l.phone), l.email, case when l.phone is not null then '+' || l.phone end,
              nullif(trim(coalesce(p_program, '')), ''), 'activo', current_date, p_amount_total, cur,
              greatest(1, jsonb_array_length(coalesce(p_payments, '[]')) + jsonb_array_length(coalesce(p_installments, '[]'))),
              'Venta del CRM · ' || ll.launch_id || ' · closer ' || coalesce(closer_name, '—'))
      returning id into v_client;
      v_new_client := true;
    end if;

    for pay in select * from jsonb_array_elements(coalesce(p_payments, '[]')) loop
      if coalesce((pay ->> 'amount')::numeric, 0) <= 0 then continue; end if;
      n := n + 1;
      insert into public.payments (client_id, sales_call_id, installment_number, amount, currency, due_date, paid_at, method, receipt_path, notes)
      values (v_client, p_call, case when v_new_client then n end, (pay ->> 'amount')::numeric, cur,
              coalesce((pay ->> 'paid_at')::date, current_date), coalesce((pay ->> 'paid_at')::date, current_date),
              nullif(trim(coalesce(pay ->> 'method', '')), ''), nullif(pay ->> 'receipt_path', ''),
              'Venta · ' || ll.launch_id || ' · closer ' || coalesce(closer_name, '—'));
      collected := collected + (pay ->> 'amount')::numeric;
    end loop;
    for pay in select * from jsonb_array_elements(coalesce(p_installments, '[]')) loop
      if coalesce((pay ->> 'amount')::numeric, 0) <= 0 then continue; end if;
      n := n + 1;
      insert into public.payments (client_id, sales_call_id, installment_number, amount, currency, due_date, notes)
      values (v_client, p_call, case when v_new_client then n end, (pay ->> 'amount')::numeric, cur,
              (pay ->> 'due_date')::date, 'Cuota · venta ' || ll.launch_id);
    end loop;
    select string_agg(distinct x ->> 'method', ' + ') into methods from jsonb_array_elements(coalesce(p_payments, '[]')) x;
  end if;

  update public.sales_calls set
    status = 'realizada', attendance = coalesce(attendance, 'se_presento'), result = p_result,
    result_note = nullif(trim(coalesce(p_note, '')), ''),
    program = case when p_result = 'cerro' then nullif(trim(coalesce(p_program, '')), '') end,
    amount_total = case when p_result = 'cerro' then p_amount_total end,
    amount_collected = case when p_result = 'cerro' then collected end,
    currency = cur, payment_method = methods, client_id = v_client,
    closer_followup_at = case when p_result = 'seguimiento' then p_followup_at end,
    closed_at = now(), updated_at = now()
  where id = p_call;

  update public.lead_launches set post_class_status = case p_result
      when 'cerro' then 'Cliente · falta onboarding' when 'no_cerro' then 'No se cerró' else 'Agendado' end,
    updated_at = now()
  where id = ll.id;

  perform private.log_event(ll.lead_id, ll.launch_id, 'resultado',
    case p_result
      when 'cerro' then 'Venta: ' || cur || ' ' || p_amount_total || coalesce(' · ' || nullif(trim(p_program), ''), '')
        || ' · cobrado ' || collected || coalesce(' (' || methods || ')', '')
        || case when v_new_client then ' · cliente creado en Clientes y pagos' else ' · pagos sumados al cliente existente' end
      when 'no_cerro' then 'No cerró'
      else 'Seguimiento del closer' || coalesce(' · ' || to_char(p_followup_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'), '')
    end || coalesce(E'\n' || nullif(trim(p_note), ''), ''),
    jsonb_build_object('call_id', p_call, 'client_id', v_client, 'from', ll.post_class_status));

  return jsonb_build_object('client_id', v_client, 'new_client', v_new_client, 'collected', collected);
end;
$$;

-- Pago nuevo de una venta: se descuenta de las cuotas pendientes en orden.
create function public.crm_add_payment(p_call uuid, p_amount numeric, p_method text, p_paid_at date, p_receipt_path text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.sales_calls := private.my_call(p_call);
  ll public.lead_launches;
  rest numeric := p_amount;
  q public.payments;
begin
  if c.result is distinct from 'cerro' then raise exception 'La call no tiene una venta'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'El monto tiene que ser mayor a 0'; end if;
  select * into ll from public.lead_launches where id = c.lead_launch_id;
  insert into public.payments (client_id, sales_call_id, amount, currency, due_date, paid_at, method, receipt_path, notes)
  values (c.client_id, p_call, p_amount, c.currency, coalesce(p_paid_at, current_date), coalesce(p_paid_at, current_date),
          nullif(trim(coalesce(p_method, '')), ''), p_receipt_path, 'Pago · venta ' || ll.launch_id);
  for q in select * from public.payments where sales_call_id = p_call and paid_at is null order by due_date nulls last, created_at for update loop
    exit when rest <= 0;
    if q.amount <= rest then
      rest := rest - q.amount;
      delete from public.payments where id = q.id;
    else
      update public.payments set amount = amount - rest where id = q.id;
      rest := 0;
    end if;
  end loop;
  update public.sales_calls set amount_collected = coalesce(amount_collected, 0) + p_amount, updated_at = now() where id = p_call;
  perform private.log_event(ll.lead_id, ll.launch_id, 'pago',
    'Pago: ' || c.currency || ' ' || p_amount || coalesce(' (' || nullif(trim(p_method), '') || ')', ''), jsonb_build_object('call_id', p_call));
end;
$$;

-- Reemplaza el plan de cuotas pendientes de una venta.
create function public.crm_set_installments(p_call uuid, p_installments jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.sales_calls := private.my_call(p_call);
  ll public.lead_launches;
  q jsonb;
begin
  if c.result is distinct from 'cerro' then raise exception 'La call no tiene una venta'; end if;
  select * into ll from public.lead_launches where id = c.lead_launch_id;
  delete from public.payments where sales_call_id = p_call and paid_at is null;
  for q in select * from jsonb_array_elements(coalesce(p_installments, '[]')) loop
    if coalesce((q ->> 'amount')::numeric, 0) > 0 then
      insert into public.payments (client_id, sales_call_id, amount, currency, due_date, notes)
      values (c.client_id, p_call, (q ->> 'amount')::numeric, c.currency, (q ->> 'due_date')::date, 'Cuota · venta ' || ll.launch_id);
    end if;
  end loop;
  perform private.log_event(ll.lead_id, ll.launch_id, 'pago', 'Actualizó el plan de cuotas (' || jsonb_array_length(coalesce(p_installments, '[]')) || ')');
end;
$$;

-- =====================================================================
-- Métricas compartidas
-- =====================================================================

-- Cash del lanzamiento (pagos de sus ventas) para la cabecera del equipo.
create function public.crm_launch_progress(p_launch text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not (private.is_superadmin() or private.my_sdr_id() is not null or private.my_closer_id() is not null) then null else
    jsonb_build_object(
      'cash', coalesce((select sum(p.amount) from public.payments p join public.sales_calls c on c.id = p.sales_call_id
                        join public.lead_launches ll on ll.id = c.lead_launch_id
                        where ll.launch_id = p_launch and p.paid_at is not null), 0),
      'cash_today', coalesce((select sum(p.amount) from public.payments p join public.sales_calls c on c.id = p.sales_call_id
                        join public.lead_launches ll on ll.id = c.lead_launch_id
                        where ll.launch_id = p_launch and p.paid_at = (now() at time zone 'America/Argentina/Buenos_Aires')::date), 0),
      'sales', (select count(*) from public.sales_calls c join public.lead_launches ll on ll.id = c.lead_launch_id
                where ll.launch_id = p_launch and c.result = 'cerro'),
      'sales_today', (select count(*) from public.sales_calls c join public.lead_launches ll on ll.id = c.lead_launch_id
                where ll.launch_id = p_launch and c.result = 'cerro'
                  and (c.closed_at at time zone 'America/Argentina/Buenos_Aires')::date = (now() at time zone 'America/Argentina/Buenos_Aires')::date)
    ) end;
$$;

-- Comisiones: SDR (sobre las ventas que agendó) y closer (sobre las que cerró), sobre el cash cobrado.
-- Lo cobrado en el período cuenta como ganado; las cuotas pendientes, como pendiente de cobrar.
-- Cada uno ve solo la suya; el admin, todas.
create function public.crm_commissions(p_from date default null, p_to date default null)
returns table (rep_id uuid, role text, sales bigint, cash numeric, earned numeric, pending numeric)
language sql stable security definer set search_path = '' as $$
  with cfg as (select sdr_commission_pct sdr_pct, closer_commission_pct closer_pct from public.crm_settings),
  sale as (
    select c.id, c.closer_id, c.sdr_id,
      coalesce(sum(p.amount) filter (where p.paid_at is not null and (p_from is null or p.paid_at >= p_from) and (p_to is null or p.paid_at <= p_to)), 0) cash,
      coalesce(sum(p.amount) filter (where p.paid_at is null), 0) due,
      bool_or(p_from is null or (c.closed_at at time zone 'America/Argentina/Buenos_Aires')::date between p_from and coalesce(p_to, 'infinity'::date)) in_period
    from public.sales_calls c left join public.payments p on p.sales_call_id = c.id
    where c.result = 'cerro'
    group by c.id
  ),
  roles as (
    select closer_id rep_id, 'closer' role, s.* from sale s where closer_id is not null
    union all
    select sdr_id, 'sdr', s.* from sale s where sdr_id is not null
  )
  select r.rep_id, r.role,
    count(*) filter (where r.in_period),
    sum(r.cash),
    round(sum(r.cash) * (case when r.role = 'sdr' then cfg.sdr_pct else cfg.closer_pct end) / 100, 2),
    round(sum(r.due) * (case when r.role = 'sdr' then cfg.sdr_pct else cfg.closer_pct end) / 100, 2)
  from roles r, cfg
  where private.is_superadmin() or r.rep_id = private.my_sdr_id() or r.rep_id = private.my_closer_id()
  group by r.rep_id, r.role, cfg.sdr_pct, cfg.closer_pct;
$$;

-- ---------- Grants ----------
do $$
declare f text;
begin
  foreach f in array array[
    'crm_claim(uuid)', 'crm_release(uuid)', 'crm_dial(uuid, int)', 'crm_update_lead(uuid, jsonb)',
    'crm_followup_done(uuid, boolean, text)', 'crm_finalize(uuid, text)', 'crm_reopen(uuid)',
    'crm_set_no_cuenta(uuid, text)', 'crm_log_agents(uuid, uuid[], text)',
    'crm_create_lead(text, text, text, text, text, boolean, uuid, timestamptz)',
    'crm_mark_attendance(uuid, text)',
    'crm_record_call_result(uuid, text, text, text, numeric, text, jsonb, jsonb, timestamptz)',
    'crm_add_payment(uuid, numeric, text, date, text)', 'crm_set_installments(uuid, jsonb)',
    'crm_launch_progress(text)', 'crm_commissions(date, date)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    'cadence_hours(text)', 'needs_followup(public.lead_launches)', 'sync_lead(uuid)', 'auto_assign_enabled()',
    'my_lead_launch(uuid)', 'my_call(uuid)'
  ] loop
    execute format('revoke execute on function private.%s from public, anon, authenticated', f);
  end loop;
end $$;
