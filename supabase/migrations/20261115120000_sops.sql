-- =====================================================================
-- SOPs: los procesos del negocio en un solo lugar (pestaña «SOPs»).
-- Los ve el equipo (admins, SDRs y closers); los alumnos no.
-- Cada SOP es un link (artifact, Doc, Loom…) o un texto escrito acá.
-- =====================================================================

create table public.sops (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  area text not null default 'General',          -- Ventas, Onboarding, Operaciones…
  description text,
  url text,                                      -- link al SOP (artifact, Doc, Loom)
  body text,                                     -- o el SOP escrito acá
  audience text not null default 'equipo' check (audience in ('equipo', 'admin')),
  position int not null default 0,
  published boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (url is not null or body is not null)
);

alter table public.sops enable row level security;

create policy "sops: el equipo ve los publicados" on public.sops
  for select to authenticated
  using (
    (select private.is_superadmin())
    or (published and audience = 'equipo'
        and ((select private.my_sdr_id()) is not null or (select private.my_closer_id()) is not null))
  );
create policy "sops: admin gestiona" on public.sops
  for all to authenticated
  using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
