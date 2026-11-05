-- =====================================================================
-- Comisión por programa: cada miembro del equipo puede tener un % sobre ventas
-- y otro sobre upsells distintos para cada programa (Genesis Lite, Genesis OS…).
-- Reemplaza a team_members.auto_programs, que usaba el mismo % para todos.
-- =====================================================================

create table public.team_program_rates (
  member_id uuid not null references public.team_members (id) on delete cascade,
  program text not null check (length(trim(program)) > 0),
  pct numeric(5, 2) not null default 0 check (pct between 0 and 100),
  upsell_pct numeric(5, 2) not null default 0 check (upsell_pct between 0 and 100),
  primary key (member_id, program)
);
comment on table public.team_program_rates is
  'Se asigna solo a cada cliente de ese programa, con estos % (ventas y upsells).';

alter table public.team_program_rates enable row level security;
create policy "team_program_rates: solo admin" on public.team_program_rates
  for all to authenticated
  using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
revoke all on public.team_program_rates from anon;

-- Lo que había en auto_programs pasa a la tabla nueva con los % del miembro.
insert into public.team_program_rates (member_id, program, pct, upsell_pct)
select t.id, p, t.commission_pct, t.upsell_pct
from public.team_members t, unnest(t.auto_programs) p
on conflict do nothing;

comment on column public.team_members.auto_programs is
  'Obsoleta: se usa team_program_rates. Se borra cuando la versión nueva del campus esté publicada.';

-- La asignación automática toma el % del programa del cliente.
create or replace function private.client_team_auto()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.program is not null then
    insert into public.client_team (client_id, member_id, pct, upsell_pct)
    select new.id, r.member_id, r.pct, r.upsell_pct
    from public.team_program_rates r
    join public.team_members t on t.id = r.member_id
    where t.active and r.program = new.program
    on conflict (client_id, member_id) do nothing;
  end if;
  return new;
end $$;
revoke execute on function private.client_team_auto() from public, anon, authenticated;
