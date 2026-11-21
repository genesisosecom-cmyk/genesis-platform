-- =====================================================================
-- Paso 1 · Funnels y ciclos.
-- Un funnel es un contenedor permanente (webinar, evergreen orgánico…);
-- un lanzamiento (launches) es un ciclo dentro de un funnel.
-- Aditiva: no se migra ni se borra nada. Los datos de hoy quedan en el
-- funnel `webinar`.
-- =====================================================================

create table public.funnels (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  name text not null,
  kind text not null check (kind in ('webinar', 'evergreen', 'otro')),
  active boolean not null default true,
  sort integer not null default 0,
  config jsonb not null default '{}',   -- etapas, campos y métricas del funnel
  created_at timestamptz not null default now()
);

alter table public.funnels enable row level security;
create policy "funnels: solo admin" on public.funnels
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
-- Igual que launches: SDRs y closers los leen (para elegir funnel y ciclo en su panel).
create policy "funnels: el equipo lee" on public.funnels
  for select to authenticated using ((select private.my_sdr_id()) is not null or (select private.my_closer_id()) is not null);

insert into public.funnels (id, name, kind, sort) values
  ('webinar', 'Webinars', 'webinar', 1),
  ('evergreen-organico', 'Evergreen orgánico', 'evergreen', 2);

-- ---------- Cada ciclo pertenece a un funnel ----------
alter table public.launches add column funnel_id text references public.funnels (id) on update cascade;
update public.launches set funnel_id = 'webinar';
alter table public.launches alter column funnel_id set not null;
create index launches_funnel_idx on public.launches (funnel_id);

-- «Actual» deja de ser global: un ciclo actual por funnel.
drop index public.launches_one_current_idx;
create unique index launches_current_per_funnel on public.launches (funnel_id) where is_current;

-- starts_at = inicio del trimestre. Además de ordenar los ciclos, evita que una pantalla que
-- todavía elija «el primer ciclo actual» (ordenados por fecha) tome este en vez del webinar.
insert into public.launches (id, name, funnel_id, is_current, starts_at) values
  ('evergreen-2026-q4', 'Evergreen orgánico · Q4 2026', 'evergreen-organico', true, '2026-10-01 00:00:00-03');

-- ---------- Ciclo actual de un funnel ----------
-- Sin argumento sigue devolviendo el del funnel `webinar`: es lo que usan la landing
-- (ingest_*) y el CRM cuando no se les dice otra cosa.
drop function private.current_launch();
create function private.current_launch(p_funnel text default 'webinar')
returns text language sql stable set search_path = '' as $$
  select id from public.launches where is_current and funnel_id = coalesce(p_funnel, 'webinar') limit 1;
$$;
revoke execute on function private.current_launch(text) from public, anon, authenticated;
