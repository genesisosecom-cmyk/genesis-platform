/**
 * Reglas del CRM del lado del navegador: listas del SDR, nivel de prioridad, resumen de la
 * tarjeta, seguimientos y "Para revisar". El estado lo guarda la base (funciones crm_*);
 * acá solo se clasifica para mostrar.
 */
import type { Cadence, LeadLaunch, SalesCall } from '../lib/types';
import type { LeadRow } from './api';

// ---------- Inversión y nivel de prioridad ----------

/** Opciones de inversión diaria en Meta de la landing, de mayor a menor. */
export const INVESTMENT_LEVELS = [
  'Más de 1.000 dólares',
  'De 500 a 1.000 dólares',
  'De 200 a 500 dólares',
  'De 100 a 200 dólares',
  'Menos de 100 dólares',
  '0, todavía no tengo marca',
];

export const investmentRank = (v: string | null) => {
  const i = v ? INVESTMENT_LEVELS.indexOf(v) : -1;
  return i === -1 ? INVESTMENT_LEVELS.length : i;
};

export type Level = 'alto' | 'medio' | 'potencial';
export const LEVEL_LABEL: Record<Level, string> = { alto: 'Alto', medio: 'Medio', potencial: 'Potencial' };

/**
 * Alto: más de 1.000, o de 500 a 1.000 y califica de verdad.
 * Medio: de 100 a 1.000, o califica de verdad. Si el SDR dijo que no califica, como mucho medio.
 * Potencial: el resto.
 */
export function leadLevel(r: Pick<LeadLaunch, 'inversion_meta' | 'sdr_qualified'>): Level {
  const tier = r.inversion_meta === 'Más de 1.000 dólares' ? 3 : r.inversion_meta === 'De 500 a 1.000 dólares' ? 2
    : r.inversion_meta === 'De 200 a 500 dólares' || r.inversion_meta === 'De 100 a 200 dólares' ? 1 : 0;
  const q = r.sdr_qualified;
  if (q === false) return tier >= 1 ? 'medio' : 'potencial';
  if (tier === 3 || (tier === 2 && q === true)) return 'alto';
  if (tier >= 1 || q === true) return 'medio';
  return 'potencial';
}

const LEVEL_RANK: Record<Level, number> = { alto: 0, medio: 1, potencial: 2 };

// ---------- Estado del lead para el SDR ----------

export const isNoCuenta = (r: LeadLaunch) => Boolean(r.no_cuenta_reason);
export const isFinalized = (r: LeadLaunch) => Boolean(r.finalized_at);
export const isBooked = (r: LeadLaunch) => r.agendo === true;
export const inFollowup = (r: LeadRow) => Boolean(r.lead.sdr_id) && !isBooked(r) && !isFinalized(r) && !isNoCuenta(r) && Boolean(r.followup_started_at);
export const followupDue = (r: LeadRow, now = Date.now()) => inFollowup(r) && Boolean(r.next_followup_at && Date.parse(r.next_followup_at) <= now);
/** Ya no requiere acción del SDR: agendado, finalizado o vendido. */
export const isDone = (r: LeadRow) => isFinalized(r) || isBooked(r);

export const CADENCES: { key: Cadence; title: string; sub: string; detail: string }[] = [
  { key: 'intensa', title: 'Más seguido', sub: 'Muy interesado', detail: '2 h, 6 h, 12 h y 24 h; después todos los días hasta el día 14, 2 por semana hasta el mes y 1 por semana hasta los 3 meses' },
  { key: 'normal', title: 'Como acordamos', sub: 'El de siempre', detail: '4 h, 12 h, 24 h y 48 h; después 1 por día hasta la semana y 1 por semana hasta los 3 meses' },
  { key: 'espaciada', title: 'Más espaciado', sub: 'Poco interesado o sin plata ahora', detail: '1 cada 2 semanas durante 3 meses' },
  { key: 'ninguna', title: 'No hacer seguimiento', sub: 'No le interesa', detail: 'No te vuelve a aparecer: queda en Finalizados' },
];
/** Cantidad de seguimientos de cada cadencia (igual que private.cadence_hours). */
export const CADENCE_STEPS: Record<Cadence, number> = { intensa: 29, normal: 20, espaciada: 6, ninguna: 0 };

export const FINALIZE_REASONS = [
  'No contestó tras la cadencia',
  'Número equivocado',
  'No le interesa',
  'No califica',
  'Descalificado',
  'Pidió que lo contacten más adelante',
  'Ya está en otro programa',
];

export const NO_CUENTA_REASONS = ['Duplicado', 'Datos falsos', 'De prueba', 'Otro'];

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Por qué está en seguimiento. */
export function followupWhy(r: LeadLaunch) {
  if (r.sdr_qualified === false) return 'No califica de verdad';
  if (r.agendo === false) return 'Calificó y no agendó';
  if (r.readiness === 'nutricion') return 'Todavía no está listo (nutrición)';
  return 'No contestó';
}

/** Resumen de una línea de cómo viene el lead. */
export function summaryLine(r: LeadRow, closerName?: (id: string | null) => string | null) {
  if (isNoCuenta(r)) return `No cuenta: ${r.no_cuenta_reason}`;
  if (isFinalized(r)) return `Finalizado: ${r.finalized_reason ?? '—'}${r.finalized_by_name ? ` (${r.finalized_by_name})` : ''}`;
  if (isBooked(r)) return `Agendado${r.closer_id && closerName ? ` a ${closerName(r.closer_id) ?? 'closer'}` : ''}`;
  if (inFollowup(r)) return `${followupWhy(r)} · en seguimiento`;
  if (r.sdr_qualified === true) return 'Calificó · falta agendar';
  if (r.answered === true) return 'Contestó · falta calificar';
  if (r.contact_attempts > 0) return `${plural(r.contact_attempts, 'dial')} · falta marcar cómo salió`;
  return 'Sin tocar todavía';
}

/** Pre-clase hasta que pasa la clase del lanzamiento (o aplica); después, post-clase. */
export const stageOf = (r: LeadLaunch, launchStartsAt: string | null) =>
  r.applied_at || (launchStartsAt && Date.parse(launchStartsAt) < Date.now()) ? 'Post-clase' : 'Pre-clase';

export const daysAgo = (iso: string | null) => {
  if (!iso) return null;
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return d <= 0 ? 'hoy' : d === 1 ? 'hace 1 día' : `hace ${d} días`;
};

/** Orden de las tarjetas: nivel, aplicó, seguimiento vencido, inversión, más reciente. */
export function byLevel(a: LeadRow, b: LeadRow) {
  return (
    LEVEL_RANK[leadLevel(a)] - LEVEL_RANK[leadLevel(b)] ||
    Number(b.route === 'aplicado') - Number(a.route === 'aplicado') ||
    investmentRank(a.inversion_meta) - investmentRank(b.inversion_meta) ||
    (a.next_followup_at ?? '9999').localeCompare(b.next_followup_at ?? '9999') ||
    (b.optin_at ?? b.created_at).localeCompare(a.optin_at ?? a.created_at)
  );
}

// ---------- Listas del SDR ----------

export type ListKey = 'bolsa' | 'mios' | 'seguimientos' | 'finalizados' | 'aplicaron' | 'sin_calificar' | 'agentes' | 'no_cuentan';

export const LISTS: { key: ListKey; label: string; hint: string; more?: boolean }[] = [
  { key: 'bolsa', label: 'Por asignar', hint: 'Calificados sin SDR. Tomá uno para trabajarlo.' },
  { key: 'mios', label: 'Mis leads', hint: 'Los tuyos que todavía no agendaron ni están en seguimiento.' },
  { key: 'seguimientos', label: 'Seguimientos', hint: 'No contestaron, no calificaron, no estaban listos o no agendaron. Te aparecen según la cadencia.' },
  { key: 'finalizados', label: 'Finalizados', hint: 'Agendados o finalizados. Se pueden reabrir.' },
  { key: 'aplicaron', label: 'Aplicaron', hint: 'Aplicaron al formulario del webinar en vivo.' },
  { key: 'sin_calificar', label: 'Sin calificar', hint: 'Invierten menos de 100 USD/día y no tienen SDR.', more: true },
  { key: 'agentes', label: 'Pidieron agentes', hint: 'Los que pidieron los agentes de IA por WhatsApp.', more: true },
  { key: 'no_cuentan', label: 'No cuentan', hint: 'Duplicados, datos falsos o pruebas. No suman en las métricas.', more: true },
];

/** ¿El lead va en esta lista? `me` = id del SDR (null para "Todo el equipo"). */
export function inList(key: ListKey, r: LeadRow, me: string | null): boolean {
  const mine = (x: LeadRow) => (me ? x.lead.sdr_id === me : Boolean(x.lead.sdr_id));
  if (key === 'no_cuentan') return isNoCuenta(r) && (!me || r.lead.sdr_id === me || !r.lead.sdr_id);
  if (isNoCuenta(r)) return false;
  switch (key) {
    case 'bolsa':
      return !r.lead.sdr_id && r.califica === true && !isFinalized(r);
    case 'mios':
      return mine(r) && !isDone(r) && !inFollowup(r);
    case 'seguimientos':
      return mine(r) && inFollowup(r);
    case 'finalizados':
      return mine(r) && isDone(r);
    case 'aplicaron':
      return r.route === 'aplicado' && (!me || !r.lead.sdr_id || r.lead.sdr_id === me);
    case 'sin_calificar':
      return !r.lead.sdr_id && r.califica !== true && !isFinalized(r);
    case 'agentes':
      return r.asked_agents && (!me || !r.lead.sdr_id || r.lead.sdr_id === me);
  }
}

// ---------- Para revisar ----------

export interface ReviewItem {
  id: string;
  text: string;
}

/** Datos faltantes del SDR que afectan las métricas. */
export function sdrReview(rows: LeadRow[], me: string): ReviewItem[] {
  return rows
    .filter((r) => r.lead.sdr_id === me && !isNoCuenta(r) && !isFinalized(r))
    .flatMap((r) => {
      const name = r.lead.full_name || r.lead.email || 'lead';
      if (r.contact_attempts > 0 && r.answered === null) return [{ id: r.id, text: `${name}: marcá si contestó` }];
      if (r.answered === true && r.sdr_qualified === null) return [{ id: r.id, text: `${name}: contestó, falta marcar si califica` }];
      if (r.sdr_qualified === true && r.agendo === null) return [{ id: r.id, text: `${name}: calificó, falta agendar o marcar que no agendó` }];
      return [];
    });
}

/** Calls del closer sin marcar y ventas incompletas. */
export function closerReview(calls: (SalesCall & { lead_launch: LeadRow })[], dueBySale: Record<string, number>): ReviewItem[] {
  const now = Date.now();
  return calls.flatMap((c) => {
    const name = c.lead_launch.lead.full_name || c.lead_launch.lead.email || 'lead';
    if (c.status === 'agendada' && Date.parse(c.scheduled_at) < now - 30 * 60000 && !c.attendance) return [{ id: c.id, text: `${name}: la call ya pasó, marcá si se presentó` }];
    if (c.attendance === 'se_presento' && !c.result) return [{ id: c.id, text: `${name}: se presentó, falta el resultado` }];
    if (c.result === 'cerro') {
      const covered = Number(c.amount_collected ?? 0) + (dueBySale[c.id] ?? 0);
      if (covered + 0.5 < Number(c.amount_total ?? 0)) return [{ id: c.id, text: `${name}: la venta no tiene el plan de cuotas completo` }];
    }
    if (c.result === 'seguimiento' && c.closer_followup_at && Date.parse(c.closer_followup_at) < now) return [{ id: c.id, text: `${name}: tenés un follow-up vencido` }];
    return [];
  });
}

// ---------- Calls ----------

export type CallState = 'pendiente' | 'sinmarcar' | 'se_presento' | 'no_show' | 'cancelo' | 'seguimiento' | 'cerro' | 'no_cerro' | 'cancelada';

export const CALL_STATE: Record<CallState, { label: string; tone: 'ok' | 'warn' | 'muted' | 'accent' }> = {
  pendiente: { label: 'Agendada', tone: 'accent' },
  sinmarcar: { label: 'Pasó sin marcar', tone: 'warn' },
  se_presento: { label: 'Se presentó', tone: 'accent' },
  no_show: { label: 'No-show', tone: 'warn' },
  cancelo: { label: 'Canceló', tone: 'warn' },
  seguimiento: { label: 'Seguimiento', tone: 'accent' },
  cerro: { label: 'Venta', tone: 'ok' },
  no_cerro: { label: 'No cerró', tone: 'muted' },
  cancelada: { label: 'Reagendada', tone: 'muted' },
};

export function callState(c: SalesCall): CallState {
  if (c.status === 'cancelada') return 'cancelada';
  if (c.result) return c.result;
  if (c.attendance) return c.attendance;
  return Date.parse(c.scheduled_at) < Date.now() ? 'sinmarcar' : 'pendiente';
}

// ---------- Simulador ----------

export interface SimInput {
  dialsPerDay: number;
  answerRate: number; // % que contestan
  bookRate: number; // % que agendan (de los que contestan)
  showRate: number; // % show-up
  closeRate: number; // % cierre (de los que se presentan)
  ticket: number;
}

/** Proyección a 30 días: agendas, ventas, cash y comisión. */
export function simulate(v: SimInput, pct: number) {
  const contacts = v.dialsPerDay * 30 * (v.answerRate / 100);
  const booked = contacts * (v.bookRate / 100);
  const shows = booked * (v.showRate / 100);
  const sales = shows * (v.closeRate / 100);
  const cash = sales * v.ticket;
  return { booked, shows, sales, cash, commission: (cash * pct) / 100 };
}

/** Fechas de un período en hora local: [desde, hasta] como YYYY-MM-DD. */
export type Period = 'hoy' | 'semana' | 'mes' | 'todo';
export function periodRange(p: Period, offset = 0): { from: string | null; to: string | null } {
  if (p === 'todo') return { from: null, to: null };
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  let from: Date;
  let to: Date;
  if (p === 'hoy') {
    from = new Date(d.getTime() - offset * 86400000);
    to = from;
  } else if (p === 'semana') {
    const dow = (d.getDay() + 6) % 7;
    from = new Date(d.getTime() - (dow + offset * 7) * 86400000);
    to = new Date(from.getTime() + 6 * 86400000);
  } else {
    from = new Date(d.getFullYear(), d.getMonth() - offset, 1);
    to = new Date(d.getFullYear(), d.getMonth() - offset + 1, 0);
  }
  const iso = (x: Date) => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

/** Día local (YYYY-MM-DD) de una fecha o timestamp. */
export const localDay = (iso: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const inRange = (iso: string | null, r: { from: string | null; to: string | null }) => {
  if (!iso) return false;
  const day = localDay(iso);
  return (!r.from || day >= r.from) && (!r.to || day <= r.to);
};
