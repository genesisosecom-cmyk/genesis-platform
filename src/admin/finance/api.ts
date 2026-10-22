import { supabase, unwrap } from '../../lib/supabase';
import type { Client, Payment } from '../../lib/types';
import type { ClientTeam, Expense, FinanceData, Payout, TeamMember } from './compute';

/** numeric de Postgres llega como string: lo pasamos a número en las columnas indicadas. */
function num<T>(rows: T[], keys: (keyof T)[]): T[] {
  return rows.map((r) => {
    const copy = { ...r };
    for (const k of keys) (copy[k] as unknown) = Number(r[k] ?? 0);
    return copy;
  });
}

export async function fetchFinance(): Promise<FinanceData> {
  const [clients, payments, expenses, team, clientTeam, payouts] = await Promise.all([
    supabase.from('clients').select('*').then((r) => unwrap(r) as Client[]),
    supabase.from('payments').select('*').then((r) => unwrap(r) as Payment[]),
    supabase.from('expenses').select('*').order('date', { ascending: false }).then((r) => unwrap(r) as Expense[]),
    supabase.from('team_members').select('*').order('created_at').then((r) => unwrap(r) as TeamMember[]),
    supabase.from('client_team').select('*').then((r) => unwrap(r) as ClientTeam[]),
    supabase.from('team_payouts').select('*').order('date', { ascending: false }).then((r) => unwrap(r) as Payout[]),
  ]);
  return {
    clients,
    payments,
    expenses: num(expenses, ['amount']),
    team: num(team, ['commission_pct', 'monthly_fee', 'profit_share_pct']),
    clientTeam: num(clientTeam, ['pct']),
    payouts: num(payouts, ['amount']),
  };
}

export const TEAM_ROLES = ['Closer', 'Setter', 'Coach', 'Socio', 'Operaciones', 'Marketing', 'Otro'];
export const EXPENSE_CATEGORIES = ['Publicidad', 'Software', 'Equipo externo', 'Comisiones de pago', 'Impuestos', 'Oficina', 'Otros'];
