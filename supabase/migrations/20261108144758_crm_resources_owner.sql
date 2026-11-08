-- =====================================================================
-- Recursos propios de cada SDR y closer.
-- owner_id null  = recurso compartido que carga el admin (los que ya existen quedan así).
-- owner_id = uid = recurso personal: solo lo ve y edita su dueño (y el superadmin).
-- Los compartidos se leen según audience: 'todos' (SDR y closers), 'sdr' o 'closer'.
-- =====================================================================

alter table public.crm_resources
  add column owner_id uuid references public.profiles (id) on delete cascade;
create index crm_resources_owner_id_idx on public.crm_resources (owner_id);
comment on column public.crm_resources.owner_id is
  'Dueño del recurso personal (SDR o closer). null = recurso compartido del admin.';

-- La política de lectura anterior dejaba leer todos los activos; ahora filtra por audiencia
-- (como ya hacía el panel) y suma los propios.
drop policy "crm_resources: el equipo lee los activos" on public.crm_resources;

create policy "crm_resources: el equipo lee los compartidos de su audiencia" on public.crm_resources
  for select to authenticated using (
    owner_id is null and active and (
      (audience in ('todos', 'sdr') and (select private.my_sdr_id()) is not null)
      or (audience in ('todos', 'closer') and (select private.my_closer_id()) is not null)
    )
  );

create policy "crm_resources: cada uno lee los suyos" on public.crm_resources
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "crm_resources: el equipo crea los suyos" on public.crm_resources
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and ((select private.my_sdr_id()) is not null or (select private.my_closer_id()) is not null)
  );

create policy "crm_resources: cada uno edita los suyos" on public.crm_resources
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and ((select private.my_sdr_id()) is not null or (select private.my_closer_id()) is not null)
  );

create policy "crm_resources: cada uno borra los suyos" on public.crm_resources
  for delete to authenticated using (owner_id = (select auth.uid()));

-- "crm_resources: solo admin" (for all) sigue igual: el superadmin puede todo.
