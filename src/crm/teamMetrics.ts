/**
 * Métricas del equipo de ventas: lo que devuelve crm_team_metrics y cómo se muestra cada número
 * (formato y texto del ⓘ). Los porcentajes vienen de 0 a 100 con un decimal; null = sin datos («—»).
 */
import { supabase, unwrap } from '../lib/supabase';
import { fmtMoney } from '../lib/format';

export type MetricValue = number | null;
export type MetricRow = { id: string; nombre: string; estado: 'activo' | 'pausado' | 'baja' | null } & Record<string, unknown>;

export interface TeamMetrics {
  launch: string;
  desde: string | null;
  hasta: string | null;
  generado: string;
  sdr: MetricRow[];
  closer: MetricRow[];
  /** Leads sin SDR (solo para el admin). */
  sin_asignar?: { leads: number; califican_por_inversion: number; aplicaron: number } | null;
}

export const fetchTeamMetrics = async (launch: string | null, from: string | null, to: string | null) =>
  unwrap(await supabase.rpc('crm_team_metrics', { p_launch: launch, p_from: from, p_to: to })) as TeamMetrics;

type Fmt = 'num' | 'pct' | 'usd' | 'min' | 'horas' | 'dias';

export interface MetricDef {
  key: string;
  label: string;
  fmt: Fmt;
  tip: string;
}

const n1 = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 1 });

export function fmtMetric(v: unknown, fmt: Fmt): string {
  if (v === null || v === undefined || v === '') return '—';
  const x = Number(v);
  if (!Number.isFinite(x)) return '—';
  switch (fmt) {
    case 'pct':
      return `${n1(x)}%`;
    case 'usd':
      return fmtMoney(x, 'USD');
    case 'min':
      return `${n1(x)} min`;
    case 'horas':
      return `${n1(x)} h`;
    case 'dias':
      return `${n1(x)} ${x === 1 ? 'día' : 'días'}`;
    default:
      return n1(x);
  }
}

const m = (key: string, label: string, fmt: Fmt, tip: string): MetricDef => ({ key, label, fmt, tip });

// ---------- SDR ----------

export const SDR_KEY: MetricDef[] = [
  m('speed_to_lead_mediana_min', 'Speed to lead', 'min', 'Minutos que tarda en tocar un lead desde que se le asigna (mediana: la mitad de los leads se tocan más rápido que esto).'),
  m('pick_up_rate', 'Pick-up rate', 'pct', 'Leads que contestaron alguna vez, sobre los contactados.'),
  m('dials_hoy', 'Dials hoy', 'num', 'Intentos registrados hoy.'),
  m('agendas', 'Agendas', 'num', 'Calls que agendó con un closer.'),
  m('pct_agenda_sobre_calificados', 'Agenda / calificados', 'pct', 'Agendas sobre calificados.'),
  m('show_rate_agendas', 'Show rate', 'pct', 'De sus agendas con asistencia cargada, cuántos se presentaron.'),
];

export const SDR_DETAIL: { title: string; items: MetricDef[] }[] = [
  {
    title: 'Leads',
    items: [
      m('leads_asignados', 'Leads asignados', 'num', 'Leads que se le asignaron en este período.'),
      m('califican_por_inversion', 'Califican por inversión', 'num', 'Leads asignados que en la landing dijeron invertir 100 dólares por día o más.'),
      m('aplicaron', 'Aplicaron', 'num', 'Leads asignados que completaron la aplicación post-clase.'),
      m('leads_contactados', 'Contactados', 'num', 'Leads a los que les hizo al menos un intento de contacto.'),
      m('pct_contactados', '% contactados', 'pct', 'Leads a los que les hizo al menos un intento de contacto.'),
      m('leads_sin_tocar', 'Sin tocar', 'num', 'Leads asignados que todavía no recibieron ningún intento y siguen abiertos.'),
      m('seguimientos_vencidos', 'Seguimientos vencidos', 'num', 'Leads con un seguimiento que ya se pasó de fecha y siguen abiertos.'),
      m('no_cuentan', 'No cuentan', 'num', 'Leads marcados como «No cuentan».'),
    ],
  },
  {
    title: 'Dials y velocidad',
    items: [
      m('dials', 'Dials', 'num', 'Llamadas o intentos registrados (botón de dial o «No atendió»).'),
      m('dials_por_dia', 'Dials por día', 'num', 'Promedio de intentos por día trabajado.'),
      m('intentos_por_lead', 'Intentos por lead', 'num', 'Promedio de intentos por lead contactado.'),
      m('dials_atendidos', 'Dials atendidos', 'num', 'Llamadas en las que marcó «Atendió».'),
      m('pick_up_rate_por_dial', 'Pick-up rate por dial', 'pct', 'Porcentaje de llamadas que fueron atendidas'),
      m('speed_to_lead_promedio_min', 'Speed to lead (promedio)', 'min', 'Minutos que tarda en tocar un lead desde que se le asigna, en promedio.'),
      m('pct_tocados_en_5_min', 'Tocados en 5 min', 'pct', 'Porcentaje de leads que tocó dentro de los 5 minutos de asignados.'),
      m('pct_tocados_en_1_hora', 'Tocados en 1 hora', 'pct', 'Porcentaje de leads que tocó dentro de la hora de asignados.'),
      m('horas_hasta_primera_respuesta', 'Hasta la primera respuesta', 'horas', 'Horas desde la asignación hasta que el lead contestó por primera vez (mediana).'),
    ],
  },
  {
    title: 'Conversación y calificación',
    items: [
      m('contestaron', 'Contestaron', 'num', 'Leads que contestaron alguna vez, sobre los contactados.'),
      m('conversaciones_reales', 'Conversaciones reales', 'num', 'De los que contestaron, cuántos tuvieron una conversación real.'),
      m('pct_conversaciones', '% conversaciones', 'pct', 'De los que contestaron, cuántos tuvieron una conversación real.'),
      m('calificados', 'Calificados', 'num', 'De las conversaciones reales, cuántos calificaron de verdad.'),
      m('pct_calificados', '% calificados', 'pct', 'De las conversaciones reales, cuántos calificaron de verdad.'),
      m('pidieron_agentes', 'Pidieron agentes', 'num', 'Leads que pidieron los 3 agentes.'),
      m('agentes_enviados', 'Agentes enviados', 'num', 'Leads a los que ya se les mandaron los agentes.'),
    ],
  },
  {
    title: 'Agendas y ventas',
    items: [
      m('pct_agenda_sobre_contactados', 'Agenda / contactados', 'pct', 'Agendas sobre contactados.'),
      m('ventas_de_sus_agendas', 'Ventas de sus agendas', 'num', 'Ventas que salieron de sus agendas.'),
      m('pct_cierre_agendas', '% cierre de sus agendas', 'pct', 'Ventas sobre las calls que agendó.'),
      m('cash_vendido', 'Cash vendido', 'usd', 'Monto vendido que salió de sus agendas.'),
      m('cash_cobrado', 'Cash cobrado', 'usd', 'Monto cobrado que salió de sus agendas.'),
      m('finalizados', 'Finalizados', 'num', 'Leads cerrados y por qué.'),
    ],
  },
];

// ---------- Closer ----------

export const CLOSER_KEY: MetricDef[] = [
  m('show_rate', 'Show rate', 'pct', 'Porcentaje que se presentó, sobre las calls con asistencia cargada.'),
  m('close_rate', 'Close rate', 'pct', 'Ventas sobre los que se presentaron.'),
  m('cash_cobrado', 'Cash cobrado', 'usd', 'Monto cobrado.'),
  m('ventas', 'Ventas', 'num', 'Calls que terminaron en venta.'),
  m('calls_proximas', 'Calls próximas', 'num', 'Calls que vienen.'),
  m('calls_sin_resultado', 'Sin resultado', 'num', 'Calls que ya pasaron y todavía no tienen el resultado cargado.'),
];

export const CLOSER_DETAIL: { title: string; items: MetricDef[] }[] = [
  {
    title: 'Agenda',
    items: [
      m('calls_agendadas', 'Calls agendadas', 'num', 'Calls agendadas en el período (sin contar las reprogramadas).'),
      m('calls_hoy', 'Calls hoy', 'num', 'Calls que son hoy.'),
      m('dias_de_agenda_a_call', 'De agenda a call', 'dias', 'Días entre que se agenda y la fecha de la call (mediana).'),
    ],
  },
  {
    title: 'Asistencia',
    items: [
      m('se_presentaron', 'Se presentaron', 'num', 'Asistencia de las calls: se presentaron.'),
      m('no_shows', 'No-shows', 'num', 'Asistencia de las calls: no se presentaron.'),
      m('cancelaron', 'Cancelaron', 'num', 'Asistencia de las calls: cancelaron.'),
    ],
  },
  {
    title: 'Resultado',
    items: [
      m('no_cerro', 'No cerró', 'num', 'Resultado de las calls: no cerró.'),
      m('en_seguimiento', 'En seguimiento', 'num', 'Resultado de las calls: quedó en seguimiento.'),
      m('close_rate_sobre_agendadas', 'Close rate / agendadas', 'pct', 'Ventas sobre todas las calls agendadas.'),
      m('ventas_hoy', 'Ventas hoy', 'num', 'Ventas cerradas hoy.'),
      m('horas_hasta_cargar_resultado', 'Hasta cargar el resultado', 'horas', 'Horas entre la call y la carga del resultado (mediana).'),
    ],
  },
  {
    title: 'Cash',
    items: [
      m('cash_vendido', 'Cash vendido', 'usd', 'Monto vendido.'),
      m('cash_pendiente', 'Cash pendiente', 'usd', 'Lo que falta cobrar.'),
      m('pct_cobrado', '% cobrado', 'pct', 'Porcentaje cobrado sobre lo vendido.'),
      m('ticket_promedio', 'Ticket promedio', 'usd', 'Monto promedio por venta.'),
      m('cash_por_call', 'Cash por call', 'usd', 'Cash cobrado por cada call en la que el lead se presentó.'),
    ],
  },
];

const META = new Set(['id', 'nombre', 'estado']);

/** De baja y con todo en cero (o sin datos): no se muestra. */
export function isEmptyBaja(r: MetricRow) {
  if (r.estado !== 'baja') return false;
  return Object.entries(r).every(([k, v]) => {
    if (META.has(k)) return true;
    if (v === null || v === undefined) return true;
    if (typeof v === 'object') return Object.keys(v as object).length === 0;
    return Number(v) === 0;
  });
}

// ---------- Rango de fechas (Argentina) ----------

export type RangeKey = 'hoy' | '7dias' | 'todo' | 'custom';

const arDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d);

export function rangeDates(key: RangeKey, custom: { from: string; to: string }): { from: string | null; to: string | null } {
  const today = arDay(new Date());
  if (key === 'hoy') return { from: today, to: today };
  if (key === '7dias') return { from: arDay(new Date(Date.now() - 6 * 86400000)), to: today };
  if (key === 'custom') return { from: custom.from || null, to: custom.to || null };
  return { from: null, to: null };
}

export const todayAR = () => arDay(new Date());
