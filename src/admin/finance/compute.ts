/**
 * Cálculos de Finanzas. Todo se calcula mes a mes en USD y después se suma
 * para el período elegido, así el reparto de ganancia de los socios se
 * calcula sobre el resultado de cada mes (un mes con pérdida no reparte).
 */
import type { Client, Payment } from '../../lib/types';

export const BASE_CURRENCY = 'USD';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  commission_pct: number;
  monthly_fee: number;
  profit_share_pct: number;
  start_date: string;
  end_date: string | null;
  active: boolean;
}

export interface ClientTeam {
  client_id: string;
  member_id: string;
  pct: number;
}

export interface Expense {
  id: string;
  date: string;
  concept: string;
  category: string;
  amount: number;
  currency: string;
  recurring: boolean;
  end_date: string | null;
  notes: string | null;
}

export interface Payout {
  id: string;
  member_id: string;
  date: string;
  amount: number;
  currency: string;
  notes: string | null;
}

export interface FinanceData {
  clients: Client[];
  payments: Payment[];
  expenses: Expense[];
  team: TeamMember[];
  clientTeam: ClientTeam[];
  payouts: Payout[];
}

export interface CommissionLine {
  memberId: string;
  clientId: string;
  paymentId: string;
  date: string;
  collected: number;
  pct: number;
  amount: number;
}

export interface MemberEarnings {
  commissions: number;
  fixed: number;
  profitShare: number;
  total: number;
}

export interface MonthResult {
  month: string; // YYYY-MM
  billing: number;
  cash: number;
  expenses: number;
  commissions: number;
  fixed: number;
  /** Resultado antes del reparto a socios. */
  net: number;
  profitShare: number;
  /** Lo que queda en la empresa después de repartir. */
  retained: number;
  byMember: Record<string, MemberEarnings>;
  commissionLines: CommissionLine[];
}

export type PeriodResult = Omit<MonthResult, 'month' | 'commissionLines'> & {
  months: string[];
  commissionLines: CommissionLine[];
};

export const monthOf = (iso: string) => iso.slice(0, 7);
const isBase = (currency: string | null | undefined) => (currency ?? BASE_CURRENCY).toUpperCase() === BASE_CURRENCY;
const round = (n: number) => Math.round(n * 100) / 100;

/** Meses entre dos claves YYYY-MM, inclusive. */
export function monthRange(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Mes de venta de un cliente: el de su primer pago cobrado (null si todavía no pagó). */
export function saleMonth(clientId: string, payments: Payment[]) {
  const first = payments
    .filter((p) => p.client_id === clientId && p.paid_at)
    .map((p) => p.paid_at!)
    .sort()[0];
  return first ? monthOf(first) : null;
}

const inMonth = (month: string, start: string | null | undefined, end: string | null | undefined) =>
  (!start || monthOf(start) <= month) && (!end || month <= monthOf(end));

export function computeMonth(month: string, d: FinanceData): MonthResult {
  const byMember: Record<string, MemberEarnings> = {};
  const member = (id: string) => (byMember[id] ??= { commissions: 0, fixed: 0, profitShare: 0, total: 0 });

  // Facturación: el contrato completo cuenta en el mes de la venta, que es el mes del primer pago
  // del cliente (no importa cuándo arranca el programa).
  const billing = d.clients
    .filter((c) => isBase(c.currency) && saleMonth(c.id, d.payments) === month)
    .reduce((s, c) => s + Number(c.total_amount), 0);

  const paid = d.payments.filter((p) => isBase(p.currency) && p.paid_at && monthOf(p.paid_at) === month);
  const cash = paid.reduce((s, p) => s + Number(p.amount), 0);

  const expenses = d.expenses
    .filter((e) => isBase(e.currency) && (e.recurring ? inMonth(month, e.date, e.end_date) : monthOf(e.date) === month))
    .reduce((s, e) => s + Number(e.amount), 0);

  const commissionLines: CommissionLine[] = [];
  for (const p of paid) {
    for (const ct of d.clientTeam.filter((x) => x.client_id === p.client_id)) {
      const amount = round((Number(p.amount) * Number(ct.pct)) / 100);
      commissionLines.push({ memberId: ct.member_id, clientId: p.client_id, paymentId: p.id, date: p.paid_at!, collected: Number(p.amount), pct: Number(ct.pct), amount });
      member(ct.member_id).commissions += amount;
    }
  }
  const commissions = commissionLines.reduce((s, l) => s + l.amount, 0);

  let fixed = 0;
  for (const t of d.team) {
    if (Number(t.monthly_fee) > 0 && inMonth(month, t.start_date, t.end_date)) {
      member(t.id).fixed += Number(t.monthly_fee);
      fixed += Number(t.monthly_fee);
    }
  }

  const net = round(cash - expenses - commissions - fixed);
  let profitShare = 0;
  if (net > 0) {
    for (const t of d.team) {
      if (Number(t.profit_share_pct) > 0 && inMonth(month, t.start_date, t.end_date)) {
        const share = round((net * Number(t.profit_share_pct)) / 100);
        member(t.id).profitShare += share;
        profitShare += share;
      }
    }
  }
  for (const e of Object.values(byMember)) e.total = round(e.commissions + e.fixed + e.profitShare);

  return {
    month,
    billing: round(billing),
    cash: round(cash),
    expenses: round(expenses),
    commissions: round(commissions),
    fixed: round(fixed),
    net,
    profitShare: round(profitShare),
    retained: round(net - profitShare),
    byMember,
    commissionLines,
  };
}

export function sumMonths(results: MonthResult[]): PeriodResult {
  const byMember: Record<string, MemberEarnings> = {};
  for (const r of results) {
    for (const [id, e] of Object.entries(r.byMember)) {
      const acc = (byMember[id] ??= { commissions: 0, fixed: 0, profitShare: 0, total: 0 });
      acc.commissions = round(acc.commissions + e.commissions);
      acc.fixed = round(acc.fixed + e.fixed);
      acc.profitShare = round(acc.profitShare + e.profitShare);
      acc.total = round(acc.total + e.total);
    }
  }
  const sum = (k: 'billing' | 'cash' | 'expenses' | 'commissions' | 'fixed' | 'net' | 'profitShare' | 'retained') =>
    round(results.reduce((s, r) => s + r[k], 0));
  return {
    months: results.map((r) => r.month),
    billing: sum('billing'),
    cash: sum('cash'),
    expenses: sum('expenses'),
    commissions: sum('commissions'),
    fixed: sum('fixed'),
    net: sum('net'),
    profitShare: sum('profitShare'),
    retained: sum('retained'),
    byMember,
    commissionLines: results.flatMap((r) => r.commissionLines),
  };
}

/** Primer mes con datos (para "Todo" y para el saldo acumulado del equipo). */
export function firstMonth(d: FinanceData, fallback: string) {
  const dates = [
    ...d.payments.map((p) => p.paid_at),
    ...d.expenses.map((e) => e.date),
    ...d.team.map((t) => t.start_date),
  ].filter(Boolean) as string[];
  return dates.length ? monthOf(dates.sort()[0]) : fallback;
}

/** Montos que no están en USD (no se suman, se avisan). */
export function foreignItems(d: FinanceData) {
  return (
    d.payments.filter((p) => p.paid_at && !isBase(p.currency)).length +
    d.expenses.filter((e) => !isBase(e.currency)).length +
    d.payouts.filter((p) => !isBase(p.currency)).length
  );
}

/** Pagado a cada miembro (USD) hasta `untilMonth` inclusive, y dentro de un rango de meses. */
export function payoutsByMember(payouts: Payout[], months?: string[]) {
  const set = months ? new Set(months) : null;
  const out: Record<string, number> = {};
  for (const p of payouts) {
    if (!isBase(p.currency) || (set && !set.has(monthOf(p.date)))) continue;
    out[p.member_id] = round((out[p.member_id] ?? 0) + Number(p.amount));
  }
  return out;
}
