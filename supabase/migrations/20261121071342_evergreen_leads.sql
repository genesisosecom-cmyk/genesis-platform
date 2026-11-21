-- =====================================================================
-- Paso 6 · Leads del evergreen.
-- Campos de calificación nuevos en lead_launches (todos opcionales, el
-- webinar no los usa), Instagram como tercera forma de identificar un
-- lead, y la configuración de cada funnel (etapas, campos, KPIs).
-- =====================================================================

-- ---------- Instagram en leads ----------
-- Los que entran por DM o comentario no traen email ni teléfono.
alter table public.leads add column instagram text unique
  check (instagram = lower(instagram) and instagram ~ '^[a-z0-9._]+$');
alter table public.leads drop constraint leads_check;
alter table public.leads add constraint leads_check check (email is not null or phone is not null or instagram is not null);

-- "@Usuario", "instagram.com/usuario/" → "usuario"
create function private.norm_instagram(v text)
returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(regexp_replace(lower(trim(coalesce(v, ''))), '^(https?://)?(www\.)?instagram\.com/', ''), '(^@+|[/?#].*$|[^a-z0-9._])', '', 'g'), '');
$$;

create function private.find_lead(e text, ph text, ig text)
returns uuid language sql stable set search_path = '' as $$
  select coalesce(
    (select id from public.leads where e is not null and email = e),
    (select id from public.leads where ph is not null and phone = ph),
    (select id from public.leads where ig is not null and instagram = ig)
  );
$$;

-- Como upsert_lead(e, ph, nombre, dup) pero sumando Instagram a la deduplicación.
create function private.upsert_lead(e text, ph text, ig text, nombre text, dup boolean, out lead_id uuid, out existed boolean)
language plpgsql set search_path = '' as $$
begin
  lead_id := private.find_lead(e, ph, ig);
  existed := lead_id is not null;
  if lead_id is null then
    insert into public.leads (email, phone, instagram, full_name, possible_duplicate)
    values (e, ph, ig, coalesce(nombre, ''), dup)
    on conflict do nothing
    returning id into lead_id;
    if lead_id is null then
      lead_id := private.find_lead(e, ph, ig);
      existed := true;
    end if;
  end if;
  if nombre <> '' then
    update public.leads set full_name = nombre, updated_at = now() where id = lead_id and full_name = '';
  end if;
  -- Completa el dato que faltaba si nadie más lo tiene.
  update public.leads l set
    instagram = case when l.instagram is null and ig is not null and not exists (select 1 from public.leads x where x.instagram = ig) then ig else l.instagram end,
    email = case when l.email is null and e is not null and not exists (select 1 from public.leads x where x.email = e) then e else l.email end,
    phone = case when l.phone is null and ph is not null and not exists (select 1 from public.leads x where x.phone = ph) then ph else l.phone end
  where l.id = lead_id and existed
    and ((l.instagram is null and ig is not null) or (l.email is null and e is not null) or (l.phone is null and ph is not null));
end;
$$;

revoke execute on function private.norm_instagram(text) from public, anon, authenticated;
revoke execute on function private.find_lead(text, text, text) from public, anon, authenticated;
revoke execute on function private.upsert_lead(text, text, text, text, boolean) from public, anon, authenticated;

-- ---------- Campos del evergreen en lead_launches ----------
alter table public.lead_launches
  add column subavatar text check (subavatar in ('S1', 'S2', 'S3', 'sin_capital', 'afuera')),
  add column entry_keyword text,            -- CUENTA, PISO, CICLO, TRATAMIENTO, CPA…
  add column entry_content_id uuid,         -- la pieza que lo trajo (la FK llega con content_pieces)
  add column entry_channel text check (entry_channel in ('instagram_dm', 'instagram_comentario', 'whatsapp', 'youtube', 'tiktok', 'otro')),
  add column pain integer check (pain between 1 and 10),   -- dolor del mapa
  add column quote text,                    -- frase textual del lead
  add column sells_today boolean,           -- ¿vende hoy?
  add column sells_what text,               -- qué vende y por dónde
  add column repurchase_cycle text,         -- cada cuánto se termina el producto
  add column capital text,                  -- con cuánto capital cuenta
  add column wanted_when text,              -- para cuándo lo quiere
  add column lane text check (lane in ('os', 'lite', 'sin_llamada'));  -- carril
create index lead_launches_keyword_idx on public.lead_launches (launch_id, entry_keyword) where entry_keyword is not null;
create index lead_launches_content_idx on public.lead_launches (entry_content_id) where entry_content_id is not null;

-- ---------- Configuración de cada funnel ----------
update public.funnels set config = '{
  "stages": ["Palabra recibida", "En conversación", "Calificado", "Aplicó", "Llamada agendada", "Cerró OS", "Cerró Lite", "No cerró", "Nutrición", "No califica"],
  "lead_fields": ["subavatar", "entry_keyword", "entry_content_id", "pain", "quote", "sells_today", "sells_what", "repurchase_cycle", "capital", "wanted_when", "lane"],
  "qualified_rule": "sells_today = true y capital para OS",
  "kpis": ["conversaciones_por_palabra", "conversaciones_calificadas", "aplicaciones", "llamadas", "cierres_os", "cierres_lite", "cash"],
  "programs": [{"id": "Genesis OS", "price_usd": 5000, "public": true}, {"id": "Genesis Lite", "price_usd": 2000, "public": false}],
  "keywords": ["CUENTA", "PISO", "CICLO", "TRATAMIENTO", "CPA"]
}'::jsonb where id = 'evergreen-organico';

-- El webinar guarda lo que hoy está fijo en el código, para que el panel lea todo del mismo lugar.
update public.funnels set config = '{
  "stages": ["Nuevo lead", "No atendió", "Agendado", "No se cerró", "Cliente · falta onboarding", "Cliente"],
  "stage_field": "post_class_status",
  "lead_fields": ["inversion_meta", "califica", "toco_grupo", "class_confirmed_at", "route", "application"],
  "qualified_rule": "inversion_meta: invierte USD 100 por día o más en Meta",
  "kpis": ["optins", "calificados", "aplicaciones", "llamadas", "cierres", "cash"],
  "programs": [{"id": "Genesis OS", "price_usd": 5000, "public": true}, {"id": "Genesis OG", "public": true}, {"id": "Genesis Lite", "price_usd": 2000, "public": false}],
  "keywords": []
}'::jsonb where id = 'webinar';

-- Tipo de funnel de un ciclo.
create function private.launch_kind(p_launch text)
returns text language sql stable set search_path = '' as $$
  select f.kind from public.launches l join public.funnels f on f.id = l.funnel_id where l.id = p_launch;
$$;
revoke execute on function private.launch_kind(text) from public, anon, authenticated;

-- Calificado en evergreen = vende hoy + capital para Genesis OS (carril «os»).
-- Sin los dos datos todavía no se sabe (null).
create function private.califica_evergreen(p_sells boolean, p_lane text)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_sells = false or p_lane in ('lite', 'sin_llamada') then false
    when p_sells and p_lane = 'os' then true
  end;
$$;
revoke execute on function private.califica_evergreen(boolean, text) from public, anon, authenticated;

-- En evergreen la etapa (stage) acompaña lo que pasa con la llamada: agendar, cerrar, no cerrar.
create function private.evergreen_stage_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_program text;
begin
  if new.post_class_status is not distinct from old.post_class_status or private.launch_kind(new.launch_id) is distinct from 'evergreen' then
    return new;
  end if;
  if new.post_class_status = 'Agendado' then
    new.stage := 'Llamada agendada';
  elsif new.post_class_status = 'No se cerró' and exists (select 1 from public.sales_calls c where c.lead_launch_id = new.id and c.result = 'no_cerro') then
    new.stage := 'No cerró';
  elsif new.post_class_status = 'Cliente · falta onboarding' and old.post_class_status is distinct from 'Cliente' then
    select program into v_program from public.sales_calls c where c.lead_launch_id = new.id and c.result = 'cerro' order by c.closed_at desc limit 1;
    new.stage := case when v_program ilike '%lite%' then 'Cerró Lite' else 'Cerró OS' end;
  end if;
  return new;
end;
$$;
revoke execute on function private.evergreen_stage_sync() from public, anon, authenticated;
create trigger lead_launches_evergreen_stage before update of post_class_status on public.lead_launches
  for each row execute function private.evergreen_stage_sync();

-- ---------- Alta manual: recibe el funnel (y el Instagram) ----------
drop function public.crm_create_lead(text, text, text, text, text, boolean, uuid, timestamptz);
create function public.crm_create_lead(
  p_name text, p_email text, p_phone text, p_inversion text, p_origin text,
  p_assign_me boolean default true, p_closer uuid default null, p_call_at timestamptz default null,
  p_funnel text default null, p_instagram text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.my_sdr_id();
  e text := private.norm_email(p_email);
  ph text := private.norm_phone(p_phone);
  ig text := private.norm_instagram(p_instagram);
  launch text := private.current_launch(coalesce(nullif(p_funnel, ''), 'webinar'));
  evergreen boolean;
  v_lead uuid;
  v_existed boolean;
  v_ll uuid;
  owner uuid;
  owner_name text;
begin
  if not (private.is_superadmin() or me is not null or private.my_closer_id() is not null) then
    raise exception 'Sin permisos para cargar leads';
  end if;
  if launch is null then raise exception 'El funnel % no tiene un ciclo actual', coalesce(p_funnel, 'webinar'); end if;
  evergreen := private.launch_kind(launch) = 'evergreen';
  if trim(coalesce(p_name, '')) = '' then raise exception 'Falta el nombre'; end if;
  if e is null and ph is null and ig is null then raise exception 'Cargá el mail, el WhatsApp o el Instagram'; end if;

  select u.lead_id, u.existed into v_lead, v_existed from private.upsert_lead(e, ph, ig, trim(p_name), false) u;
  select sdr_id into owner from public.leads where id = v_lead;
  if v_existed and owner is not null and owner is distinct from me then
    select name into owner_name from public.sales_reps where id = owner;
    raise exception 'Ese lead ya existe y lo tiene %', coalesce(owner_name, 'otro SDR');
  end if;

  insert into public.lead_launches as ll (lead_id, launch_id, inversion_meta, califica, source, tracking, stage)
  values (v_lead, launch, nullif(p_inversion, ''), case when evergreen then null else private.califica(nullif(p_inversion, ''), null) end,
          'Carga manual · ' || coalesce(nullif(trim(p_origin), ''), 'sin origen'), jsonb_build_object('origen', p_origin),
          case when evergreen then 'En conversación' else 'Nuevo' end)
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
revoke execute on function public.crm_create_lead(text, text, text, text, text, boolean, uuid, timestamptz, text, text) from public, anon;
grant execute on function public.crm_create_lead(text, text, text, text, text, boolean, uuid, timestamptz, text, text) to authenticated;

-- ---------- Ficha: los campos del evergreen se editan por la misma función ----------
create or replace function public.crm_update_lead(p_ll uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches := private.my_lead_launch(p_ll);
  k text;
  yn text;
  changes text[] := array[]::text[];
  ficha text[] := array[]::text[];   -- cambios de la ficha de calificación del evergreen
  lbl jsonb := '{"answered": "¿Contestó?", "real_conversation": "¿Conversación real?", "sdr_qualified": "¿Califica de verdad?"}';
  cad jsonb := '{"intensa": "Más seguido", "normal": "Como acordamos", "espaciada": "Más espaciado", "ninguna": "No hacer seguimiento"}';
  flbl jsonb := '{"subavatar": "Subavatar", "entry_keyword": "Palabra", "entry_channel": "Canal", "quote": "Frase textual",
    "sells_what": "Qué vende", "repurchase_cycle": "Cada cuánto se termina", "capital": "Capital", "wanted_when": "Para cuándo", "lane": "Carril"}';
  evergreen boolean := private.launch_kind(ll.launch_id) = 'evergreen';
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
    -- ----- Evergreen -----
    elsif k in ('subavatar', 'entry_keyword', 'entry_channel', 'quote', 'sells_what', 'repurchase_cycle', 'capital', 'wanted_when', 'lane') then
      execute format('update public.lead_launches set %I = $1 where id = $2', k)
        using case when k = 'entry_keyword' then upper(nullif(trim(p ->> k), '')) else nullif(trim(p ->> k), '') end, p_ll;
      ficha := ficha || ((flbl ->> k) || ': ' || coalesce(nullif(trim(p ->> k), ''), '—'));
    elsif k = 'pain' then
      update public.lead_launches set pain = (p ->> k)::int where id = p_ll;
      ficha := ficha || ('Dolor: ' || coalesce(p ->> k, '—'));
    elsif k = 'sells_today' then
      update public.lead_launches set sells_today = (p ->> k)::boolean where id = p_ll;
      ficha := ficha || ('¿Vende hoy? ' || case when p ->> k is null then '—' when (p ->> k)::boolean then 'Sí' else 'No' end);
    elsif k = 'entry_content_id' then
      update public.lead_launches set entry_content_id = nullif(p ->> k, '')::uuid where id = p_ll;
      ficha := ficha || 'Cambió la pieza que lo trajo'::text;
    elsif k = 'stage' then
      if not exists (
        select 1 from public.launches l join public.funnels f on f.id = l.funnel_id
        where l.id = ll.launch_id and f.config -> 'stages' ? (p ->> k)
      ) then raise exception 'Etapa inválida para este funnel: %', p ->> k; end if;
      update public.lead_launches set stage = p ->> k where id = p_ll;
      changes := changes || ('Etapa: ' || ll.stage || ' → ' || (p ->> k));
    else
      raise exception 'Campo no editable: %', k;
    end if;
  end loop;
  if p ?| array['answered', 'sdr_qualified', 'readiness', 'agendo'] then
    update public.lead_launches set followup_override = null where id = p_ll;
  end if;
  -- En evergreen «califica» sale de la ficha: vende hoy + capital para OS.
  if evergreen and p ?| array['sells_today', 'lane'] then
    update public.lead_launches set califica = private.califica_evergreen(sells_today, lane) where id = p_ll;
  end if;
  if cardinality(changes) > 0 then
    perform private.log_event(ll.lead_id, ll.launch_id, case when p ? 'stage' and cardinality(changes) = 1 then 'estado' else 'contacto' end, array_to_string(changes, ' · '), p);
  end if;
  if cardinality(ficha) > 0 then
    perform private.log_event(ll.lead_id, ll.launch_id, 'calificacion', array_to_string(ficha, ' · '), p);
  end if;
  perform private.sync_lead(p_ll);
end;
$$;
