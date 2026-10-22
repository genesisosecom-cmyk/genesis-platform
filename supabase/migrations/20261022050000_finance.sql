-- =====================================================================
-- Finanzas: equipo y comisiones, gastos y pagos al equipo. Solo superadmin.
-- =====================================================================

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'Closer',
  commission_pct numeric(5, 2) not null default 0 check (commission_pct between 0 and 100),
  monthly_fee numeric(12, 2) not null default 0 check (monthly_fee >= 0),
  profit_share_pct numeric(5, 2) not null default 0 check (profit_share_pct between 0 and 100),
  start_date date not null default current_date,
  end_date date,                            -- fecha de baja (el fijo deja de sumar)
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Quién cobra comisión por cada cliente (closer, setter…) y con qué %.
create table public.client_team (
  client_id uuid not null references public.clients (id) on delete cascade,
  member_id uuid not null references public.team_members (id) on delete cascade,
  pct numeric(5, 2) not null check (pct between 0 and 100),
  primary key (client_id, member_id)
);
create index client_team_member_idx on public.client_team (member_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  concept text not null,
  category text not null default 'Otros',
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'USD',
  recurring boolean not null default false, -- se repite todos los meses desde `date`
  end_date date,                            -- último mes de un gasto recurrente (null = sigue)
  notes text,
  created_at timestamptz not null default now()
);
create index expenses_date_idx on public.expenses (date);

create table public.team_payouts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_members (id) on delete cascade,
  date date not null default current_date,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'USD',
  notes text,
  created_at timestamptz not null default now()
);
create index team_payouts_member_idx on public.team_payouts (member_id);

alter table public.team_members enable row level security;
alter table public.client_team enable row level security;
alter table public.expenses enable row level security;
alter table public.team_payouts enable row level security;

create policy "team_members: solo admin" on public.team_members
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "client_team: solo admin" on public.client_team
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "expenses: solo admin" on public.expenses
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "team_payouts: solo admin" on public.team_payouts
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
