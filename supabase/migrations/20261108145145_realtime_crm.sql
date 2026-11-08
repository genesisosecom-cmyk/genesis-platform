-- =====================================================================
-- Tiempo real: las pantallas del CRM, clientes, finanzas y respuestas se actualizan solas.
-- Supabase Realtime respeta RLS: cada usuario recibe solo los cambios de filas que puede leer
-- (todas estas tablas tienen RLS y ninguna deja leer a anon).
-- No se suman landing_visits, ingest_log ni lesson_progress: cambian muy seguido y no hacen falta.
-- =====================================================================

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array[
    'leads', 'lead_launches', 'lead_events', 'sales_calls', 'payments', 'sales_reps',
    'crm_resources', 'crm_agents', 'clients', 'client_team', 'form_responses',
    'expenses', 'team_members', 'team_payouts', 'team_program_rates'
  ] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
