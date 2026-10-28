-- Secciones dentro de un módulo (ej: "Búsqueda y validación de producto"),
-- cada una con sus clases. Las lecciones sin sección se muestran primero.
create table public.module_sections (
  id uuid primary key default gen_random_uuid(),
  module_id text not null references public.modules (id) on delete cascade,
  position int not null default 0,
  title text not null,
  created_at timestamptz not null default now()
);
create index module_sections_module_idx on public.module_sections (module_id, position);

alter table public.lessons add column section_id uuid references public.module_sections (id) on delete set null;
create index lessons_section_idx on public.lessons (section_id);

alter table public.module_sections enable row level security;

create policy "module_sections: miembros ven las de módulos publicados" on public.module_sections
  for select to authenticated
  using (
    (select private.is_superadmin())
    or exists (select 1 from public.modules m where m.id = module_id and m.published)
  );
create policy "module_sections: admin inserta" on public.module_sections
  for insert to authenticated with check ((select private.is_superadmin()));
create policy "module_sections: admin actualiza" on public.module_sections
  for update to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "module_sections: admin borra" on public.module_sections
  for delete to authenticated using ((select private.is_superadmin()));
