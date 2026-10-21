-- Saca is_superadmin() del esquema expuesto por la API (/rest/v1/rpc).
-- Las políticas RLS la referencian por OID, así que siguen funcionando.
create schema if not exists private;
grant usage on schema private to anon, authenticated;
alter function public.is_superadmin() set schema private;
