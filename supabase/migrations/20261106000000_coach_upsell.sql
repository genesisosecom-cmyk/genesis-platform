-- =====================================================================
-- Coach con comisión por oferta y upsells.
--  1. "Fast Subscription" pasa a llamarse "Genesis Lite".
--  2. Pagos marcados como venta o upsell; el cliente guarda cuánto de su contrato es upsell.
--  3. Cada asignación de comisión tiene un % sobre ventas y otro sobre upsells.
--  4. Un miembro del equipo puede asignarse solo a todos los clientes de ciertos programas.
--  5. Alta de José como coach: 10 % de Genesis Lite y 15 % de los upsells.
-- =====================================================================

-- 1. Renombre del programa.
update public.clients set program = 'Genesis Lite' where program = 'Fast Subscription';
update public.sales_calls set program = 'Genesis Lite' where program = 'Fast Subscription';
update public.class_slots set programs = array_replace(programs, 'Fast Subscription', 'Genesis Lite')
where 'Fast Subscription' = any (programs);

-- 2. Venta o upsell.
alter table public.payments
  add column kind text not null default 'venta' check (kind in ('venta', 'upsell'));
alter table public.clients
  add column upsell_amount numeric(12, 2) not null default 0 check (upsell_amount >= 0);
comment on column public.clients.upsell_amount is
  'Parte de total_amount que corresponde a upsells (se factura en el mes del primer pago del upsell).';

-- 3. % sobre upsells por miembro (sugerido) y por cliente (el que se aplica).
alter table public.team_members
  add column upsell_pct numeric(5, 2) not null default 0 check (upsell_pct between 0 and 100),
  add column auto_programs text[] not null default '{}';
comment on column public.team_members.auto_programs is
  'Programas en los que se asigna solo a cada cliente, con commission_pct y upsell_pct.';
alter table public.client_team
  add column upsell_pct numeric(5, 2) not null default 0 check (upsell_pct between 0 and 100);

-- 4. Asignación automática al crear un cliente o cambiarle el programa.
create function private.client_team_auto()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.program is not null then
    insert into public.client_team (client_id, member_id, pct, upsell_pct)
    select new.id, t.id, t.commission_pct, t.upsell_pct
    from public.team_members t
    where t.active and new.program = any (t.auto_programs)
    on conflict (client_id, member_id) do nothing;
  end if;
  return new;
end $$;
revoke execute on function private.client_team_auto() from public, anon, authenticated;

create trigger clients_team_auto
after insert or update of program on public.clients
for each row execute function private.client_team_auto();

-- 5. José como coach, asignado a los clientes actuales de Genesis Lite.
insert into public.team_members (name, role, commission_pct, upsell_pct, auto_programs, start_date)
values ('José', 'Coach', 10, 15, '{Genesis Lite}', '2026-10-01');

insert into public.client_team (client_id, member_id, pct, upsell_pct)
select c.id, t.id, t.commission_pct, t.upsell_pct
from public.clients c
join public.team_members t on t.name = 'José' and t.role = 'Coach'
where c.program = 'Genesis Lite'
on conflict (client_id, member_id) do nothing;
