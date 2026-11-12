-- =====================================================================
-- Cada SDR (que no es admin) ve solo sus leads y los que todavía no tienen SDR
-- (para poder tomarlos de «Por asignar»). No ve los de las otras SDR, ni sus calls
-- ni su historial: lead_events, lead_launches, leads y sales_calls usan can_see_lead.
-- Los admin ven todo. Los closers siguen viendo todos los leads (necesitan los datos del
-- lead para sus calls y para «Agendar a mano»).
-- =====================================================================

create or replace function private.can_see_lead(p_lead uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_superadmin()
    or private.my_closer_id() is not null
    or (
      private.my_sdr_id() is not null
      and exists (
        select 1 from public.leads l
        where l.id = p_lead and (l.sdr_id is null or l.sdr_id = private.my_sdr_id())
      )
    );
$$;
