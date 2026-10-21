-- =====================================================================
-- Genesis · esquema inicial
-- Campus (perfiles + progreso), formularios pre-llamada y tracking de
-- clientes (cuotas y pagos). Todo protegido con RLS.
-- =====================================================================

-- ---------- Perfiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'member' check (role in ('member', 'superadmin')),
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'superadmin' and active
  );
$$;

-- ---------- Clientes y pagos ----------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  company text,
  program text,
  status text not null default 'activo'
    check (status in ('activo', 'pausado', 'finalizado', 'baja')),
  start_date date,
  end_date date,
  total_amount numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  installments_count int not null default 1 check (installments_count > 0),
  notes text,
  profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index clients_email_idx on public.clients (lower(email));
create index clients_profile_idx on public.clients (profile_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  installment_number int,
  amount numeric(12, 2) not null,
  currency text not null default 'USD',
  due_date date,
  paid_at date,
  method text,
  notes text,
  created_at timestamptz not null default now()
);
create index payments_client_idx on public.payments (client_id);

-- Al crearse un usuario: crea su perfil y lo vincula al cliente con el mismo email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));

  update public.clients
  set profile_id = new.id
  where profile_id is null and lower(email) = lower(new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- El usuario registra su última actividad sin poder tocar otros campos.
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set last_seen_at = now() where id = (select auth.uid());
$$;

-- ---------- Progreso del campus ----------
create table public.lesson_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  module_id text not null,
  lesson_id text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  last_watched_at timestamptz,
  primary key (user_id, module_id, lesson_id)
);

-- ---------- Formularios pre-llamada ----------
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  description text,
  call_type text not null default '1:1' check (call_type in ('1:1', 'grupal')),
  questions jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  respondent_name text not null,
  respondent_email text not null,
  call_date date,
  answers jsonb not null default '{}'::jsonb,
  reviewed boolean not null default false,
  admin_notes text,
  submitted_at timestamptz not null default now()
);
create index form_responses_form_idx on public.form_responses (form_id);
create index form_responses_email_idx on public.form_responses (lower(respondent_email));
create index form_responses_user_idx on public.form_responses (user_id);

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.payments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.forms enable row level security;
alter table public.form_responses enable row level security;

create policy "profiles: ver el propio o admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_superadmin()));
create policy "profiles: admin actualiza" on public.profiles
  for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));

create policy "clients: solo admin" on public.clients
  for all to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy "payments: solo admin" on public.payments
  for all to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));

create policy "progress: ver propio o admin" on public.lesson_progress
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_superadmin()));
create policy "progress: insertar propio" on public.lesson_progress
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "progress: actualizar propio" on public.lesson_progress
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Los formularios activos se pueden abrir sin login (link que manda Manu).
create policy "forms: lectura pública de activos" on public.forms
  for select to anon, authenticated
  using (is_active or (select public.is_superadmin()));
create policy "forms: admin inserta" on public.forms
  for insert to authenticated with check ((select public.is_superadmin()));
create policy "forms: admin actualiza" on public.forms
  for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy "forms: admin borra" on public.forms
  for delete to authenticated using ((select public.is_superadmin()));

create policy "responses: envío público a formularios activos" on public.form_responses
  for insert to anon, authenticated
  with check (
    reviewed = false and admin_notes is null
    and (user_id is null or user_id = (select auth.uid()))
    and exists (select 1 from public.forms f where f.id = form_id and f.is_active)
  );
create policy "responses: ver propias o admin" on public.form_responses
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_superadmin()));
create policy "responses: admin actualiza" on public.form_responses
  for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy "responses: admin borra" on public.form_responses
  for delete to authenticated using ((select public.is_superadmin()));

-- is_superadmin() queda ejecutable por anon porque lo evalúan las políticas de `forms` (devuelve false).
revoke execute on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------- Formularios de ejemplo ----------
insert into public.forms (slug, title, description, call_type, questions) values
(
  'pre-llamada-1-1',
  'Pre-llamada 1:1',
  'Completá este formulario antes de tu llamada para que podamos ir directo a resolver.',
  '1:1',
  '[
    {"id":"situacion","label":"¿Cuál es tu situación actual?","type":"textarea","required":true,"help":"Contanos en qué punto está tu negocio hoy: facturación, clientes, equipo."},
    {"id":"problema","label":"¿Qué necesitás resolver en esta llamada?","type":"textarea","required":true},
    {"id":"intentos","label":"¿Qué probaste hasta ahora?","type":"textarea","required":false},
    {"id":"contexto","label":"Contexto o links útiles","type":"textarea","required":false,"help":"Docs, métricas, capturas, landing, etc."},
    {"id":"prioridad","label":"¿Qué tan urgente es?","type":"scale","required":true,"min":1,"max":5},
    {"id":"objetivo","label":"¿Qué resultado esperás llevarte de la llamada?","type":"text","required":true}
  ]'::jsonb
),
(
  'pre-llamada-grupal',
  'Pre-llamada grupal',
  'Dejanos tu consulta antes de la llamada grupal para priorizar los temas.',
  'grupal',
  '[
    {"id":"tema","label":"¿Qué tema querés que tratemos?","type":"select","required":true,"options":["Oferta","Adquisición","Ventas","Operación","Mentalidad","Otro"]},
    {"id":"pregunta","label":"Tu pregunta concreta","type":"textarea","required":true},
    {"id":"contexto","label":"Contexto","type":"textarea","required":false},
    {"id":"avance","label":"¿Cómo venís con el programa?","type":"scale","required":false,"min":1,"max":5}
  ]'::jsonb
);
