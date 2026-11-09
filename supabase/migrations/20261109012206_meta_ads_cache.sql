-- =====================================================================
-- Caché de las respuestas de Meta Ads (función edge meta-ads).
-- Una fila por cuenta, tipo de pedido y rango; vale 5 minutos. Solo la usa la función con la
-- service role: RLS activa y sin políticas, así que nadie más la lee ni la escribe.
-- No guarda el token. Las URLs de las miniaturas vencen: se pisan cada 5 minutos.
-- =====================================================================

create table public.meta_ads_cache (
  account_id text not null,
  kind text not null,
  since date not null,
  until date not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (account_id, kind, since, until)
);
comment on table public.meta_ads_cache is 'Respuestas de Meta Ads cacheadas 5 minutos por la función meta-ads. Sin acceso desde el navegador.';

alter table public.meta_ads_cache enable row level security;
revoke all on public.meta_ads_cache from anon, authenticated;
