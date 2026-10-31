import { supabase, unwrap } from '../../lib/supabase';
import type { LandingVisit, Launch, Lead, LeadLaunch, SalesRep } from '../../lib/types';

export type LeadRow = LeadLaunch & { lead: Lead };

/** PostgREST devuelve hasta 1000 filas por request: pide de a páginas. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const chunk = unwrap(await page(from, from + size - 1)) ?? [];
    rows.push(...chunk);
    if (chunk.length < size) return rows;
  }
}

export const fetchLaunches = async () =>
  unwrap(await supabase.from('launches').select('*').order('starts_at', { ascending: false })) as Launch[];

export const fetchLeadRows = (launchId: string) =>
  fetchAll<LeadRow>((from, to) =>
    supabase
      .from('lead_launches')
      .select('*, lead:leads(*)')
      .eq('launch_id', launchId)
      .order('optin_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to),
  );

export const fetchVisits = (launchId: string) =>
  fetchAll<LandingVisit>((from, to) =>
    supabase.from('landing_visits').select('*').eq('launch_id', launchId).range(from, to),
  );

export const fetchSalesReps = async () =>
  unwrap(await supabase.from('sales_reps').select('*').order('kind').order('assign_order')) as SalesRep[];

export async function updateRepWhatsapp(name: string, whatsapp_url: string) {
  unwrap(await supabase.from('sales_reps').update({ whatsapp_url }).eq('name', name));
}
