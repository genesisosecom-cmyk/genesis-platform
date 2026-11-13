-- =====================================================================
-- Mover un lead a mano a la lista que se quiera en el panel del SDR.
--
-- Las listas se calculan del estado del lead. La regla automática (private.needs_followup)
-- lo manda a Seguimientos si no contestó, no calificó, no estaba listo o no agendó.
-- followup_override permite ganarle a esa regla:
--   'on'  = está en Seguimientos aunque la regla no lo pida
--   'off' = no está en Seguimientos aunque la regla lo pida
--   null  = automático
-- Se vuelve automático en cuanto el SDR carga un resultado nuevo (contestó, califica,
-- listo, agendó) o reabre el lead.
-- =====================================================================

alter table public.lead_launches add column followup_override text
  check (followup_override in ('on', 'off'));
comment on column public.lead_launches.followup_override is
  'Movido a mano: on = en Seguimientos, off = fuera de Seguimientos, null = automático.';

create or replace function private.needs_followup(ll public.lead_launches)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.leads where id = ll.lead_id and sdr_id is not null)
    and ll.agendo is distinct from true and ll.finalized_at is null and ll.no_cuenta_reason is null
    and case ll.followup_override
      when 'on' then true
      when 'off' then false
      else (ll.answered = false or ll.agendo = false or ll.sdr_qualified = false or ll.readiness = 'nutricion')
    end;
$$;

-- Reabrir vuelve a lo automático.
create or replace function public.crm_reopen(p_ll uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ll public.lead_launches := private.my_lead_launch(p_ll);
begin
  update public.lead_launches set finalized_reason = null, finalized_at = null, finalized_by_name = null,
    followup_cadence = case when followup_cadence = 'ninguna' then 'normal' else followup_cadence end,
    followup_started_at = null, followup_step = 0, followup_override = null
  where id = p_ll;
  perform private.log_event(ll.lead_id, ll.launch_id, 'final', 'Reabierto');
  perform private.sync_lead(p_ll);
end;
$$;

-- Un resultado nuevo del SDR vuelve a lo automático (el resto es igual que antes).
create or replace function public.crm_update_lead(p_ll uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  if p ?| array['answered', 'sdr_qualified', 'readiness', 'agendo'] then
    update public.lead_launches set followup_override = null where id = p_ll;
  end if;
  if cardinality(changes) > 0 then
    perform private.log_event(ll.lead_id, ll.launch_id, 'contacto', array_to_string(changes, ' · '), p);
  end if;
  perform private.sync_lead(p_ll);
end;
$$;

-- Mover a una lista: 'mios' (Mis leads), 'seguimientos' o 'bolsa' (Por asignar).
-- Finalizados y No cuentan se hacen con crm_finalize y crm_set_no_cuenta (piden motivo).
create or replace function public.crm_move_lead(p_ll uuid, p_list text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ll public.lead_launches := private.my_lead_launch(p_ll);
  sdr uuid := (select sdr_id from public.leads where id = ll.lead_id);
  me uuid := private.my_sdr_id();
  label text;
begin
  if p_list not in ('mios', 'seguimientos', 'bolsa') then raise exception 'Lista inválida'; end if;
  label := case p_list when 'mios' then 'Mis leads' when 'seguimientos' then 'Seguimientos' else 'Por asignar' end;

  if p_list in ('mios', 'seguimientos') and sdr is null then
    if me is null then raise exception 'Primero asignale un SDR al lead'; end if;
    update public.leads set sdr_id = me, updated_at = now() where id = ll.lead_id;
    perform private.log_event(ll.lead_id, ll.launch_id, 'sdr', 'Se asignó el lead (al moverlo)', jsonb_build_object('sdr_id', me));
  end if;

  -- Sale de Finalizados / No cuentan / agendado. La call, si había, no se toca.
  update public.lead_launches set
    finalized_reason = null, finalized_at = null, finalized_by_name = null,
    no_cuenta_reason = null,
    agendo = case when agendo then null else agendo end,
    followup_cadence = case when followup_cadence = 'ninguna' then 'normal' else coalesce(followup_cadence, 'normal') end,
    followup_started_at = case when p_list = 'seguimientos' then now() end,
    followup_step = 0,
    followup_override = case p_list when 'seguimientos' then 'on' when 'mios' then 'off' end
  where id = p_ll;

  if p_list = 'bolsa' then
    update public.leads set sdr_id = null, updated_at = now() where id = ll.lead_id;
  end if;

  perform private.log_event(ll.lead_id, ll.launch_id, 'contacto', 'Movido a mano a «' || label || '»', jsonb_build_object('lista', p_list));
  perform private.sync_lead(p_ll);
end;
$$;

revoke all on function public.crm_move_lead(uuid, text) from public, anon;
grant execute on function public.crm_move_lead(uuid, text) to authenticated;
