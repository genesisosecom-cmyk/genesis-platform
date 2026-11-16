-- =====================================================================
-- Closer y SDR de cada cliente, y comisión de los clientes cargados a mano.
--
-- clients.closer_id / clients.sdr_id   quién cerró y quién agendó (SDR opcional: «Ninguno»).
-- sales_reps.cobra_comision            false = no suma comisión (Manu).
-- crm_commissions                      además de las ventas del CRM, suma los pagos de los
--                                      clientes con closer/SDR que no vienen de una venta del
--                                      CRM (sin sales_call_id), así no se cuentan dos veces.
-- Cuando el closer cierra una venta en el CRM, el cliente toma su closer y su SDR.
-- =====================================================================

alter table public.clients
  add column closer_id uuid references public.sales_reps (id) on delete set null,
  add column sdr_id uuid references public.sales_reps (id) on delete set null;
comment on column public.clients.closer_id is 'Closer que cerró la venta (cobra comisión salvo que sales_reps.cobra_comision sea false).';
comment on column public.clients.sdr_id is 'SDR que agendó la venta (null = ninguno).';
create index clients_closer_idx on public.clients (closer_id);
create index clients_sdr_idx on public.clients (sdr_id);

alter table public.sales_reps add column cobra_comision boolean not null default true;
comment on column public.sales_reps.cobra_comision is 'false = sus ventas no le suman comisión (por ejemplo, Manu).';
update public.sales_reps set cobra_comision = false where name = 'Manu';

-- Venta cerrada en el CRM → el cliente toma el closer y el SDR de la call (si no tenía).
create or replace function private.client_from_call()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.client_id is not null and new.result = 'cerro' then
    update public.clients set
      closer_id = coalesce(closer_id, new.closer_id),
      sdr_id = coalesce(sdr_id, new.sdr_id)
    where id = new.client_id;
  end if;
  return new;
end $$;
revoke execute on function private.client_from_call() from public, anon, authenticated;
create trigger sales_calls_client_reps
after insert or update of client_id, result on public.sales_calls
for each row execute function private.client_from_call();

update public.clients c set closer_id = s.closer_id, sdr_id = coalesce(c.sdr_id, s.sdr_id)
from (select distinct on (client_id) client_id, closer_id, sdr_id from public.sales_calls
      where result = 'cerro' and client_id is not null order by client_id, closed_at desc nulls last) s
where s.client_id = c.id and c.closer_id is null;

create or replace function public.crm_commissions(p_from date default null, p_to date default null)
returns table (rep_id uuid, role text, sales bigint, cash numeric, earned numeric, pending numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (select sdr_commission_pct sdr_pct, closer_commission_pct closer_pct from public.crm_settings),
  -- Ventas del CRM.
  sale as (
    select c.closer_id, c.sdr_id,
      coalesce(sum(p.amount) filter (where p.paid_at is not null and (p_from is null or p.paid_at >= p_from) and (p_to is null or p.paid_at <= p_to)), 0) cash,
      coalesce(sum(p.amount) filter (where p.paid_at is null), 0) due,
      bool_or(p_from is null or (c.closed_at at time zone 'America/Argentina/Buenos_Aires')::date between p_from and coalesce(p_to, 'infinity'::date)) in_period
    from public.sales_calls c left join public.payments p on p.sales_call_id = c.id
    where c.result = 'cerro'
    group by c.id
    union all
    -- Clientes cargados a mano (sus pagos no están atados a una venta del CRM).
    select cl.closer_id, cl.sdr_id,
      coalesce(sum(p.amount) filter (where p.paid_at is not null and (p_from is null or p.paid_at >= p_from) and (p_to is null or p.paid_at <= p_to)), 0),
      coalesce(sum(p.amount) filter (where p.paid_at is null), 0),
      p_from is null or coalesce(cl.start_date, (cl.created_at at time zone 'America/Argentina/Buenos_Aires')::date) between p_from and coalesce(p_to, 'infinity'::date)
    from public.clients cl left join public.payments p on p.client_id = cl.id and p.sales_call_id is null
    where (cl.closer_id is not null or cl.sdr_id is not null)
      and not exists (select 1 from public.sales_calls s where s.client_id = cl.id and s.result = 'cerro')
    group by cl.id
  ),
  roles as (
    select closer_id rep_id, 'closer' role, s.* from sale s where closer_id is not null
    union all
    select sdr_id, 'sdr', s.* from sale s where sdr_id is not null
  )
  select r.rep_id, r.role,
    count(*) filter (where r.in_period),
    sum(r.cash),
    round(sum(r.cash) * (case when not rep.cobra_comision then 0 when r.role = 'sdr' then cfg.sdr_pct else cfg.closer_pct end) / 100, 2),
    round(sum(r.due) * (case when not rep.cobra_comision then 0 when r.role = 'sdr' then cfg.sdr_pct else cfg.closer_pct end) / 100, 2)
  from roles r join public.sales_reps rep on rep.id = r.rep_id, cfg
  where private.is_superadmin() or r.rep_id = private.my_sdr_id() or r.rep_id = private.my_closer_id()
  group by r.rep_id, r.role, rep.cobra_comision, cfg.sdr_pct, cfg.closer_pct;
$$;
