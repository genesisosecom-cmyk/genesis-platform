import { supabase, unwrap } from '../lib/supabase';
import { safeName } from '../content/files';
import type { CrmSettings, LandingVisit, Launch, Lead, LeadEvent, LeadLaunch, PostClassStatus, SalesCall, SalesRep } from '../lib/types';

export type LeadRow = LeadLaunch & { lead: Lead };
export type CallRow = SalesCall & { lead_launch: LeadRow };

export const POST_CLASS_STATUSES: PostClassStatus[] = ['Nuevo lead', 'No atendió', 'Agendado', 'No se cerró', 'Cliente · falta onboarding', 'Cliente'];
/** Estados en los que el lead ya no necesita seguimiento del SDR. */
export const CLOSED_STATUSES: (PostClassStatus | null)[] = ['No se cerró', 'Cliente · falta onboarding', 'Cliente'];
const SALE_STATUSES: (PostClassStatus | null)[] = ['Cliente · falta onboarding', 'Cliente'];

export const isSale = (r: LeadLaunch) => SALE_STATUSES.includes(r.post_class_status);

export const RECEIPTS_BUCKET = 'receipts';

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** PostgREST devuelve hasta 1000 filas por request: pide de a páginas. */
async function fetchAll<T>(page: (from: number, to: number) => Page<T>) {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const chunk = unwrap(await page(from, from + size - 1)) ?? [];
    rows.push(...chunk);
    if (chunk.length < size) return rows;
  }
}

// ---------- Lecturas ----------

export const fetchLaunches = async () =>
  unwrap(await supabase.from('launches').select('*').order('starts_at', { ascending: false })) as Launch[];

/** Leads de un lanzamiento; con `sdrId`, solo los de ese SDR. */
export const fetchLeadRows = (launchId: string, sdrId?: string) =>
  fetchAll<LeadRow>((from, to) => {
    let q = supabase.from('lead_launches').select(sdrId ? '*, lead:leads!inner(*)' : '*, lead:leads(*)').eq('launch_id', launchId);
    if (sdrId) q = q.eq('lead.sdr_id', sdrId);
    return q.order('optin_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).range(from, to) as unknown as Page<LeadRow>;
  });

export const fetchLeadRow = async (id: string) =>
  unwrap(await supabase.from('lead_launches').select('*, lead:leads(*)').eq('id', id).single()) as LeadRow;

export const fetchLeadEvents = async (leadId: string) =>
  unwrap(await supabase.from('lead_events').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })) as LeadEvent[];

export const fetchCallsOf = async (leadLaunchId: string) =>
  unwrap(await supabase.from('sales_calls').select('*').eq('lead_launch_id', leadLaunchId).order('scheduled_at', { ascending: false })) as SalesCall[];

/** Llamadas con su lead; filtradas por closer y/o lanzamiento. */
export const fetchCalls = ({ closerId, launchId }: { closerId?: string; launchId?: string }) =>
  fetchAll<CallRow>((from, to) => {
    let q = supabase.from('sales_calls').select('*, lead_launch:lead_launches!inner(*, lead:leads(*))');
    if (closerId) q = q.eq('closer_id', closerId);
    if (launchId) q = q.eq('lead_launch.launch_id', launchId);
    return q.order('scheduled_at', { ascending: true }).range(from, to) as unknown as Page<CallRow>;
  });

export const fetchCall = async (id: string) =>
  unwrap(await supabase.from('sales_calls').select('*, lead_launch:lead_launches(*, lead:leads(*))').eq('id', id).single()) as CallRow;

export const fetchVisits = (launchId: string) =>
  fetchAll<LandingVisit>((from, to) => supabase.from('landing_visits').select('*').eq('launch_id', launchId).range(from, to));

export const fetchSalesReps = async () =>
  unwrap(await supabase.from('sales_reps').select('*').order('name')) as SalesRep[];

/** Cantidad de leads asignados a cada SDR (todos los lanzamientos). */
export async function fetchLeadCountBySdr() {
  const rows = await fetchAll<{ sdr_id: string | null }>((from, to) => supabase.from('leads').select('sdr_id').range(from, to));
  return rows.reduce<Record<string, number>>((acc, r) => (r.sdr_id ? { ...acc, [r.sdr_id]: (acc[r.sdr_id] ?? 0) + 1 } : acc), {});
}

export const fetchSettings = async () =>
  unwrap(await supabase.from('crm_settings').select('*').single()) as CrmSettings;

// ---------- Admin: equipo y configuración ----------

export type RepInput = Pick<SalesRep, 'name' | 'whatsapp_url' | 'profile_id' | 'sdr_status' | 'closer_status' | 'sdr_weight'>;

export async function saveRep(id: string | null, input: RepInput) {
  if (id) unwrap(await supabase.from('sales_reps').update(input).eq('id', id));
  else unwrap(await supabase.from('sales_reps').insert(input));
}

export async function saveDefaultWhatsapp(url: string) {
  unwrap(await supabase.from('crm_settings').update({ default_whatsapp_url: url, updated_at: new Date().toISOString() }).eq('id', true));
}

// ---------- Acciones (funciones crm_* de la base: validan permisos y dejan historial) ----------

async function rpc<T = void>(fn: string, args: Record<string, unknown>) {
  return unwrap(await supabase.rpc(fn, args)) as T;
}

export const setStatus = (leadLaunchId: string, status: PostClassStatus, note?: string) =>
  rpc('crm_set_status', { p_lead_launch: leadLaunchId, p_status: status, p_note: note ?? null });

export const addNote = (leadLaunchId: string, text: string) => rpc('crm_add_note', { p_lead_launch: leadLaunchId, p_text: text });

export const setNextAction = (leadLaunchId: string, text: string, at: string | null) =>
  rpc('crm_set_next_action', { p_lead_launch: leadLaunchId, p_text: text, p_at: at });

export const scheduleCall = (leadLaunchId: string, closerId: string, at: string, note: string) =>
  rpc<string>('crm_schedule_call', { p_lead_launch: leadLaunchId, p_closer: closerId, p_at: at, p_note: note });

export const rescheduleCall = (callId: string, at: string) => rpc('crm_reschedule_call', { p_call: callId, p_at: at });

export interface CallResultInput {
  result: 'no_cerro' | 'cerro';
  note: string;
  amountTotal?: number;
  amountCollected?: number;
  currency?: string;
  paymentMethod?: string;
  receiptPath?: string | null;
}

export const recordCallResult = (callId: string, r: CallResultInput) =>
  rpc<{ client_id: string | null; payment_id: string | null; new_client: boolean }>('crm_record_call_result', {
    p_call: callId,
    p_result: r.result,
    p_note: r.note,
    p_amount_total: r.amountTotal ?? null,
    p_amount_collected: r.amountCollected ?? null,
    p_currency: r.currency ?? 'USD',
    p_payment_method: r.paymentMethod ?? null,
    p_receipt_path: r.receiptPath ?? null,
  });

export const reassignSdr = (leadId: string, sdrId: string | null) => rpc('crm_reassign_sdr', { p_lead: leadId, p_sdr: sdrId });

export const reassignCall = (callId: string, closerId: string) => rpc('crm_reassign_call', { p_call: callId, p_closer: closerId });

/** Reparte los leads sin SDR (o, con `fromRep`, los abiertos de ese SDR) entre los SDR activos. */
export const distributeLeads = (launchId: string, fromRep?: string) =>
  rpc<number>('crm_distribute', { p_launch: launchId, p_from_rep: fromRep ?? null });

// ---------- Comprobantes ----------

export async function uploadReceipt(callId: string, file: File) {
  const path = `${callId}/${crypto.randomUUID()}/${safeName(file.name)}`;
  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return path;
}

export async function openReceipt(path: string) {
  // La pestaña se abre antes del await para que el navegador no la bloquee.
  const win = window.open('', '_blank');
  const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, 300);
  if (error || !data) {
    win?.close();
    window.alert('No se pudo abrir el comprobante.');
    return;
  }
  if (win) win.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}

// ---------- Helpers ----------

export const waLink = (phone: string | null) => (phone ? `https://wa.me/${phone}` : null);

/**
 * Prioridad del panel SDR: primero los que aplicaron y califican, después los que aplicaron,
 * después los calificados y al final el resto. Los cerrados van al fondo. Dentro de cada grupo,
 * la próxima tarea más cercana y después el optin más reciente.
 */
export function priority(r: LeadRow) {
  if (CLOSED_STATUSES.includes(r.post_class_status)) return 4;
  const applied = r.route === 'aplicado';
  if (applied && r.califica) return 0;
  if (applied) return 1;
  if (r.califica) return 2;
  return 3;
}

export function byPriority(a: LeadRow, b: LeadRow) {
  return (
    priority(a) - priority(b) ||
    (a.next_action_at ?? '9999').localeCompare(b.next_action_at ?? '9999') ||
    (b.applied_at ?? b.optin_at ?? '').localeCompare(a.applied_at ?? a.optin_at ?? '')
  );
}

/** `datetime-local` (hora local del navegador) ↔ ISO. */
export const localToIso = (v: string) => (v ? new Date(v).toISOString() : null);
export function isoToLocal(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
