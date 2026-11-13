-- =====================================================================
-- Lista «Enviar recurso» en el panel del SDR.
-- lead_launches.send_resource_at: desde cuándo el lead está en «Enviar recurso».
-- Mientras esté ahí no entra en Seguimientos. Se marca con «Mover a… → Enviar recurso»
-- y se saca moviéndolo a otra lista (por ejemplo, a Mis leads cuando se mandó).
-- =====================================================================

alter table public.lead_launches add column send_resource_at timestamptz;
comment on column public.lead_launches.send_resource_at is 'Desde cuándo está en la lista «Enviar recurso» (null = no está).';

create or replace function private.needs_followup(ll public.lead_launches)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.leads where id = ll.lead_id and sdr_id is not null)
    and ll.agendo is distinct from true and ll.finalized_at is null and ll.no_cuenta_reason is null
    and ll.class_confirmed_at is null and ll.send_resource_at is null
    and case ll.followup_override
      when 'on' then true
      when 'off' then false
      else (ll.answered = false or ll.agendo = false or ll.sdr_qualified = false or ll.readiness = 'nutricion')
    end;
$$;

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
  if p_list not in ('mios', 'seguimientos', 'bolsa', 'confirmados', 'recurso') then raise exception 'Lista inválida'; end if;
  label := case p_list when 'mios' then 'Mis leads' when 'seguimientos' then 'Seguimientos'
    when 'confirmados' then 'Confirmados a la clase' when 'recurso' then 'Enviar recurso' else 'Por asignar' end;

  if p_list <> 'bolsa' and sdr is null then
    if me is null then raise exception 'Primero asignale un SDR al lead'; end if;
    update public.leads set sdr_id = me, updated_at = now() where id = ll.lead_id;
    perform private.log_event(ll.lead_id, ll.launch_id, 'sdr', 'Se asignó el lead (al moverlo)', jsonb_build_object('sdr_id', me));
  end if;

  update public.lead_launches set
    finalized_reason = null, finalized_at = null, finalized_by_name = null,
    no_cuenta_reason = null,
    agendo = case when agendo then null else agendo end,
    followup_cadence = case when followup_cadence = 'ninguna' then 'normal' else coalesce(followup_cadence, 'normal') end,
    followup_started_at = case when p_list = 'seguimientos' then now() end,
    followup_step = 0,
    followup_override = case p_list when 'seguimientos' then 'on' when 'mios' then 'off' end,
    class_confirmed_at = case when p_list = 'confirmados' then coalesce(class_confirmed_at, now()) end,
    send_resource_at = case when p_list = 'recurso' then coalesce(send_resource_at, now()) end
  where id = p_ll;

  if p_list = 'bolsa' then
    update public.leads set sdr_id = null, updated_at = now() where id = ll.lead_id;
  end if;

  perform private.log_event(ll.lead_id, ll.launch_id, 'contacto',
    case p_list
      when 'confirmados' then 'Confirmó que va a la clase'
      when 'recurso' then 'Pasó a «Enviar recurso»'
      else 'Movido a mano a «' || label || '»'
    end,
    jsonb_build_object('lista', p_list));
  perform private.sync_lead(p_ll);
end;
$$;
