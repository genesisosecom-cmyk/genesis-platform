import { supabase, unwrap } from '../lib/supabase';
import type { Client, Form, FormResponse, LessonProgressRow, Payment, Profile } from '../lib/types';
import { todayISO } from '../lib/format';

export const fetchProfiles = async () =>
  unwrap(await supabase.from('profiles').select('*').order('created_at', { ascending: false })) as Profile[];

export const fetchAllProgress = async () =>
  unwrap(await supabase.from('lesson_progress').select('*')) as LessonProgressRow[];

export const fetchForms = async () =>
  unwrap(await supabase.from('forms').select('*').order('created_at', { ascending: true })) as Form[];

export const fetchResponses = async () =>
  unwrap(await supabase.from('form_responses').select('*').order('submitted_at', { ascending: false })) as FormResponse[];

export const fetchClients = async () =>
  unwrap(await supabase.from('clients').select('*').order('created_at', { ascending: false })) as Client[];

export const fetchPayments = async (clientId?: string) => {
  let q = supabase.from('payments').select('*').order('due_date', { ascending: true, nullsFirst: false });
  if (clientId) q = q.eq('client_id', clientId);
  return unwrap(await q) as Payment[];
};

export { adminUsers } from '../lib/adminUsers';

export type PaymentStatus = 'pagado' | 'vencido' | 'pendiente';

export function paymentStatus(p: Payment, today = todayISO()): PaymentStatus {
  if (p.paid_at) return 'pagado';
  if (p.due_date && p.due_date < today) return 'vencido';
  return 'pendiente';
}

export function clientBalance(client: Client, payments: Payment[]) {
  const mine = payments.filter((p) => p.client_id === client.id);
  const paid = mine.filter((p) => p.paid_at).reduce((s, p) => s + Number(p.amount), 0);
  const overdue = mine.filter((p) => paymentStatus(p) === 'vencido');
  const next = mine.filter((p) => !p.paid_at && p.due_date).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0];
  const total = Number(client.total_amount);
  return {
    paid,
    total,
    pending: Math.max(total - paid, 0),
    percent: total ? Math.min(100, Math.round((paid / total) * 100)) : 0,
    paidCount: mine.filter((p) => p.paid_at).length,
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((s, p) => s + Number(p.amount), 0),
    next,
  };
}
