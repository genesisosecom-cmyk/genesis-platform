-- =====================================================================
-- Dial con resultado: «Atendió» / «No atendió».
-- crm_dial suma un parámetro opcional p_outcome ('atendio' | 'no_atendio').
-- Se guarda en el evento (data: {dials, outcome}) para tener pick-up rate por llamada.
-- Se reemplaza la firma vieja (uuid, integer) para no dejar dos versiones;
-- los llamados con dos argumentos siguen andando por el default.
-- =====================================================================

drop function if exists public.crm_dial(uuid, integer);

create function public.crm_dial(p_ll uuid, p_delta integer, p_outcome text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ll public.lead_launches := private.my_lead_launch(p_ll);
  n int := greatest(0, ll.contact_attempts + case when p_delta >= 0 then 1 else -1 end);
  outcome text := case when p_delta >= 0 then nullif(p_outcome, '') end;
begin
  if outcome is not null and outcome not in ('atendio', 'no_atendio') then
    raise exception 'Resultado del dial inválido: %', p_outcome;
  end if;
  if n = ll.contact_attempts then return n; end if;
  update public.lead_launches set contact_attempts = n, updated_at = now() where id = p_ll;
  perform private.log_event(ll.lead_id, ll.launch_id, 'dial',
    case
      when p_delta < 0 then 'Corrigió los dials: ' || n
      when outcome = 'atendio' then 'Dial ' || n || ' · atendió'
      when outcome = 'no_atendio' then 'Dial ' || n || ' · no atendió'
      else 'Dial ' || n
    end,
    jsonb_build_object('dials', n) || case when outcome is not null then jsonb_build_object('outcome', outcome) else '{}'::jsonb end);
  perform private.sync_lead(p_ll);
  return n;
end;
$$;

revoke all on function public.crm_dial(uuid, integer, text) from public, anon;
grant execute on function public.crm_dial(uuid, integer, text) to authenticated, service_role;
