-- Recursos descargables y links de cada lección (documentos, prompts, SOPs…).
-- Los archivos se guardan en el bucket privado "toolbox" bajo el prefijo lessons/.
create table public.lesson_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id text not null references public.lessons (id) on delete cascade,
  position int not null default 0,
  title text not null,
  description text,
  url text,
  file_path text,
  file_name text,
  created_at timestamptz not null default now(),
  check (url is not null or file_path is not null)
);
create index lesson_resources_lesson_idx on public.lesson_resources (lesson_id, position);

alter table public.lesson_resources enable row level security;

-- Se ven los recursos de lecciones publicadas (o todo, si es admin).
create policy "lesson_resources: miembros ven los de lecciones publicadas" on public.lesson_resources
  for select to authenticated
  using (
    (select private.is_superadmin())
    or exists (select 1 from public.lessons l where l.id = lesson_id and l.published)
  );
create policy "lesson_resources: admin inserta" on public.lesson_resources
  for insert to authenticated with check ((select private.is_superadmin()));
create policy "lesson_resources: admin actualiza" on public.lesson_resources
  for update to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "lesson_resources: admin borra" on public.lesson_resources
  for delete to authenticated using ((select private.is_superadmin()));
