-- =====================================================================
-- Paso 9 · Reporte de ventas por fases (SOP 04).
-- Un reporte por lead y por llamada: antes de la llamada (cómo llegó),
-- triage / setting (el dolor, textual) y después de la llamada (por qué
-- compró o no, objeciones, carril y a qué pieza va cada dato).
-- Regla de producto: una llamada no se puede marcar realizada sin su reporte.
-- (No-show y canceló no son una llamada hecha: no piden reporte.)
-- =====================================================================

create table public.sales_reports (
  id uuid primary key default gen_random_uuid(),
  lead_launch_id uuid not null references public.lead_launches (id) on delete cascade,
  sales_call_id uuid references public.sales_calls (id) on delete set null,
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null,
  -- Fase 1: antes de la llamada
  first_touch text, last_touch text,        -- primer y último contacto / pieza
  entry_quote text,                         -- cómo llegó, con sus palabras
  -- Fase 2: triage / setting
  pain integer check (pain between 1 and 10),
  pain_quote text,                          -- el dolor, textual
  beliefs text,                             -- creencias que trajo
  -- Fase 3: después de la llamada
  buy_reason text,                          -- por qué compró (textual)
  no_close_reason text,                     -- por qué no cerró (textual)
  objections text,
  lane text check (lane in ('os', 'lite', 'ninguno')),
  goes_to text not null default '',         -- a qué pieza va cada dato (obligatorio al cerrar)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Uno por llamada; y uno «previo a la llamada» por lead (el del setter), que se le pega a la llamada cuando existe.
create unique index sales_reports_call_key on public.sales_reports (sales_call_id) where sales_call_id is not null;
create unique index sales_reports_pre_call_key on public.sales_reports (lead_launch_id) where sales_call_id is null;
create index sales_reports_lead_launch_idx on public.sales_reports (lead_launch_id);

alter table public.sales_reports enable row level security;
create policy "sales_reports: solo admin" on public.sales_reports
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
-- El equipo lee los de sus leads; escribe solo con crm_save_report / crm_record_call_result.
create policy "sales_reports: el equipo lee los suyos" on public.sales_reports
  for select to authenticated using (private.can_see_lead((select ll.lead_id from public.lead_launches ll where ll.id = lead_launch_id)));

-- Guarda (o completa) el reporte. Solo pisa los campos que vienen en p.
create function private.save_report(p_ll uuid, p_call uuid, p jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare
  v_id uuid;
  ll public.lead_launches;
  v_lane text := nullif(p ->> 'lane', '');
begin
  select * into ll from public.lead_launches where id = p_ll;
  if ll.id is null then raise exception 'Lead no encontrado'; end if;
  if v_lane is not null and v_lane not in ('os', 'lite', 'ninguno') then raise exception 'Carril inválido'; end if;

  -- El de la llamada; si no hay, el previo del lead (y se le asigna la llamada).
  if p_call is not null then
    select id into v_id from public.sales_reports where sales_call_id = p_call;
    if v_id is null then
      update public.sales_reports set sales_call_id = p_call where lead_launch_id = p_ll and sales_call_id is null returning id into v_id;
    end if;
  else
    select id into v_id from public.sales_reports where lead_launch_id = p_ll and sales_call_id is null;
    if v_id is null then
      -- Sin llamada nueva: se completa el último reporte del lead.
      select id into v_id from public.sales_reports where lead_launch_id = p_ll order by created_at desc limit 1;
    end if;
  end if;
  if v_id is null then
    insert into public.sales_reports (lead_launch_id, sales_call_id, author_id, author_name)
    values (p_ll, p_call, (select auth.uid()), coalesce(private.actor_name(), 'Sistema'))
    returning id into v_id;
  end if;

  update public.sales_reports set
    first_touch = case when p ? 'first_touch' then nullif(trim(p ->> 'first_touch'), '') else first_touch end,
    last_touch = case when p ? 'last_touch' then nullif(trim(p ->> 'last_touch'), '') else last_touch end,
    entry_quote = case when p ? 'entry_quote' then nullif(trim(p ->> 'entry_quote'), '') else entry_quote end,
    pain = case when p ? 'pain' then (p ->> 'pain')::int else pain end,
    pain_quote = case when p ? 'pain_quote' then nullif(trim(p ->> 'pain_quote'), '') else pain_quote end,
    beliefs = case when p ? 'beliefs' then nullif(trim(p ->> 'beliefs'), '') else beliefs end,
    buy_reason = case when p ? 'buy_reason' then nullif(trim(p ->> 'buy_reason'), '') else buy_reason end,
    no_close_reason = case when p ? 'no_close_reason' then nullif(trim(p ->> 'no_close_reason'), '') else no_close_reason end,
    objections = case when p ? 'objections' then nullif(trim(p ->> 'objections'), '') else objections end,
    lane = case when p ? 'lane' then v_lane else lane end,
    goes_to = case when p ? 'goes_to' then trim(coalesce(p ->> 'goes_to', '')) else goes_to end,
    updated_at = now()
  where id = v_id;

  -- La ficha del lead acompaña: dolor y carril (OS / Lite) si no estaban.
  update public.lead_launches set
    pain = coalesce(pain, case when p ? 'pain' then (p ->> 'pain')::int end),
    lane = case when v_lane in ('os', 'lite') then v_lane else lane end,
    updated_at = now()
  where id = p_ll and ((pain is null and p ? 'pain') or v_lane in ('os', 'lite'));
  -- En evergreen, calificado = vende hoy + capital para OS: si el carril cambió, se recalcula.
  if v_lane in ('os', 'lite') and private.launch_kind(ll.launch_id) = 'evergreen' then
    update public.lead_launches set califica = private.califica_evergreen(sells_today, lane) where id = p_ll;
  end if;

  perform private.log_event(ll.lead_id, ll.launch_id, 'reporte', 'Cargó el reporte por fases'
    || case when p_call is not null then ' de la llamada' else '' end, jsonb_build_object('report_id', v_id, 'call_id', p_call));
  return v_id;
end;
$$;
revoke execute on function private.save_report(uuid, uuid, jsonb) from public, anon, authenticated;

-- Para el panel: el setter carga las fases 1 y 2 antes de la llamada; el closer (o el admin) lo completa.
create function public.crm_save_report(p_lead_launch uuid, p_call uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  ll public.lead_launches;
begin
  select * into ll from public.lead_launches where id = p_lead_launch;
  if ll.id is null then raise exception 'Lead no encontrado'; end if;
  if p_call is not null and not exists (select 1 from public.sales_calls where id = p_call and lead_launch_id = p_lead_launch) then
    raise exception 'Esa llamada no es de este lead';
  end if;
  if not (private.is_superadmin() or private.is_lead_sdr(ll.lead_id) or private.is_lead_closer(ll.lead_id)) then
    raise exception 'Sin permisos sobre este lead';
  end if;
  return private.save_report(p_lead_launch, p_call, p);
end;
$$;
revoke execute on function public.crm_save_report(uuid, uuid, jsonb) from public, anon;
grant execute on function public.crm_save_report(uuid, uuid, jsonb) to authenticated;

-- ---------- Cerrar la llamada exige el reporte ----------
-- Mismo cuerpo que la versión vigente, más p_report (el reporte se guarda en la misma transacción).
drop function public.crm_record_call_result(uuid, text, text, text, numeric, text, jsonb, jsonb, timestamptz);
CREATE OR REPLACE FUNCTION public.crm_record_call_result(p_call uuid, p_result text, p_note text DEFAULT NULL::text, p_program text DEFAULT NULL::text, p_amount_total numeric DEFAULT NULL::numeric, p_currency text DEFAULT 'USD'::text, p_payments jsonb DEFAULT '[]'::jsonb, p_installments jsonb DEFAULT '[]'::jsonb, p_followup_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_report jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  rpt public.sales_reports;
begin
  if c.result in ('cerro', 'no_cerro') then raise exception 'La call ya tiene resultado'; end if;
  if p_result not in ('cerro', 'no_cerro', 'seguimiento') then raise exception 'Resultado inválido'; end if;
  select * into ll from public.lead_launches where id = c.lead_launch_id for update;

  -- Reporte por fases (SOP 04): una llamada no se marca realizada sin su reporte.
  if p_report is not null then
    perform private.save_report(ll.id, p_call, p_report);
  end if;
  select * into rpt from public.sales_reports where sales_call_id = p_call;
  if rpt.id is null then raise exception 'Falta el reporte por fases de la llamada'; end if;
  if p_result = 'cerro' and coalesce(trim(rpt.buy_reason), '') = '' then raise exception 'En el reporte falta por qué compró (textual)'; end if;
  if p_result = 'no_cerro' and coalesce(trim(rpt.no_close_reason), '') = '' then raise exception 'En el reporte falta por qué no cerró (textual)'; end if;
  if p_result in ('cerro', 'no_cerro') and trim(rpt.goes_to) = '' then raise exception 'En el reporte falta a qué pieza va cada dato'; end if;
  if p_result = 'cerro' and rpt.lane is null then raise exception 'En el reporte falta el carril (OS o Lite)'; end if;
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
$function$;
revoke execute on function public.crm_record_call_result(uuid, text, text, text, numeric, text, jsonb, jsonb, timestamptz, jsonb) from public, anon;
grant execute on function public.crm_record_call_result(uuid, text, text, text, numeric, text, jsonb, jsonb, timestamptz, jsonb) to authenticated;

