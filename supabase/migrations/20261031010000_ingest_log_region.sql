-- Región donde corrió la Edge Function `ingest` (SB_REGION), para ver si se respeta x-region.
alter table public.ingest_log add column region text;
