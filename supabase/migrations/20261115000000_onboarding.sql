-- =====================================================================
-- Onboarding de clientes nuevos
-- 1. Formulario de onboarding dentro del campus: una fila por usuario,
--    autoguardada paso a paso (el alumno puede dejarlo y seguir otro día).
-- 2. Cliente ↔ usuario del campus: se vinculan solos por email en las dos
--    direcciones (antes solo al crear el usuario).
-- 3. Kickoff / onboarding hecho en la ficha del cliente, sincronizado con el
--    estado «Cliente · falta onboarding» del CRM.
-- =====================================================================

-- ---------- 1. Respuestas de onboarding ----------
create table public.onboarding_responses (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  step int not null default 0,              -- último paso en el que estaba
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,                 -- envió el formulario completo
  reviewed boolean not null default false,  -- el equipo ya lo leyó
  admin_notes text
);

alter table public.onboarding_responses enable row level security;

-- El alumno lee lo suyo; escribe solo por save_onboarding (no puede tocar reviewed/notas).
create policy "onboarding: ver propio o admin" on public.onboarding_responses
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_superadmin()));
create policy "onboarding: admin actualiza" on public.onboarding_responses
  for update to authenticated
  using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "onboarding: admin borra" on public.onboarding_responses
  for delete to authenticated using ((select private.is_superadmin()));

create function public.save_onboarding(p_answers jsonb, p_step int, p_complete boolean default false)
returns public.onboarding_responses
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  r public.onboarding_responses;
begin
  if me is null then raise exception 'No autenticado'; end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then raise exception 'Respuestas inválidas'; end if;
  if pg_column_size(p_answers) > 500000 then raise exception 'Las respuestas son demasiado largas'; end if;

  insert into public.onboarding_responses as o (user_id, answers, step, completed_at)
  values (me, coalesce(p_answers, '{}'::jsonb), greatest(coalesce(p_step, 0), 0), case when p_complete then now() end)
  on conflict (user_id) do update set
    answers = excluded.answers,
    step = excluded.step,
    updated_at = now(),
    -- Si edita después de enviarlo, conserva la fecha original y vuelve a quedar «sin leer».
    completed_at = coalesce(o.completed_at, excluded.completed_at),
    reviewed = case when p_complete then false else o.reviewed end
  returning * into r;
  return r;
end;
$$;

-- Lo que el formulario necesita saber del alumno (no puede leer `clients`).
create function public.my_onboarding_context()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'full_name', coalesce(nullif(c.full_name, ''), p.full_name),
    'email', p.email,
    'phone', c.phone,
    'program', c.program
  )
  from public.profiles p
  left join lateral (
    select * from public.clients c
    where c.profile_id = p.id or (c.profile_id is null and lower(c.email) = lower(p.email))
    order by (c.profile_id = p.id) desc nulls last, c.created_at desc
    limit 1
  ) c on true
  where p.id = (select auth.uid());
$$;

revoke execute on function public.save_onboarding(jsonb, int, boolean) from public, anon;
grant execute on function public.save_onboarding(jsonb, int, boolean) to authenticated;
revoke execute on function public.my_onboarding_context() from public, anon;
grant execute on function public.my_onboarding_context() to authenticated;

-- ---------- 2. Vínculo cliente ↔ usuario por email ----------
-- Si el cliente se crea (o cambia su email) después que el usuario, se vincula igual.
create function private.link_client_profile()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.profile_id is null and nullif(trim(coalesce(new.email, '')), '') is not null then
    select id into new.profile_id from public.profiles
    where lower(email) = lower(trim(new.email))
    limit 1;
  end if;
  return new;
end;
$$;

-- Solo al crear o al cambiar el email: si el admin desvincula a mano, se respeta.
create trigger clients_link_profile
  before insert or update of email on public.clients
  for each row execute function private.link_client_profile();

-- Los que ya coinciden hoy.
update public.clients c set profile_id = p.id
from public.profiles p
where c.profile_id is null and c.email is not null and lower(c.email) = lower(p.email);

-- ---------- 3. Kickoff / onboarding hecho ----------
alter table public.clients add column onboarded_at timestamptz;

-- Marca (o desmarca) el onboarding del cliente y mueve sus leads del CRM
-- de «Cliente · falta onboarding» a «Cliente» (y al revés).
create function public.client_set_onboarded(p_client uuid, p_done boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_superadmin()) then raise exception 'Sin permisos'; end if;
  update public.clients set onboarded_at = case when p_done then coalesce(onboarded_at, now()) end where id = p_client;
  update public.lead_launches ll set
    post_class_status = case when p_done then 'Cliente' else 'Cliente · falta onboarding' end,
    updated_at = now()
  where ll.id in (select lead_launch_id from public.sales_calls where client_id = p_client)
    and ll.post_class_status = case when p_done then 'Cliente · falta onboarding' else 'Cliente' end;
end;
$$;

revoke execute on function public.client_set_onboarded(uuid, boolean) from public, anon;
grant execute on function public.client_set_onboarded(uuid, boolean) to authenticated;

-- «Onboarding hecho» desde el panel closer también lo marca en la ficha del cliente.
create function private.lead_onboarded_to_client()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.clients set onboarded_at = now()
  where onboarded_at is null
    and id in (select client_id from public.sales_calls where lead_launch_id = new.id and client_id is not null);
  return null;
end;
$$;

create trigger lead_launches_onboarded
  after update of post_class_status on public.lead_launches
  for each row
  when (new.post_class_status = 'Cliente' and old.post_class_status is distinct from 'Cliente')
  execute function private.lead_onboarded_to_client();

-- Clientes que el CRM ya tiene como «Cliente» (onboarding hecho desde el panel closer).
update public.clients c set onboarded_at = now()
where c.onboarded_at is null and exists (
  select 1 from public.sales_calls sc
  join public.lead_launches ll on ll.id = sc.lead_launch_id
  where sc.client_id = c.id and ll.post_class_status = 'Cliente'
);

-- ---------- Realtime ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'onboarding_responses') then
    alter publication supabase_realtime add table public.onboarding_responses;
  end if;
end $$;
