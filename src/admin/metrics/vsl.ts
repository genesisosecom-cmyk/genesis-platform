/** VSL de la landing: datos de crm_vsl (vTurb + campus) y los cálculos de la pantalla. */
import { supabase, unwrap } from '../../lib/supabase';

export interface VslCampus { visitas: number; registros: number; calificados: number; grupo: number }

export interface VslDay {
  dia: string;
  en_periodo: boolean;
  desde: string | null;
  hasta: string | null;
  visitas_estimadas: boolean;
  plays: number;
  plays_unicos: number;
  vistas: number;
  vistas_unicas: number;
  terminaron: number;
  clicks: number;
  sobre_pitch: number;
  conversiones: number;
  play_rate_vturb: number | null;
  promedio_visto_seg: number | null;
  /** [segundo, usuarios] de vTurb (times/user_engagement). */
  curva: [number, number][] | null;
  sincronizado: string | null;
  visitas_con_video: number;
  d1: VslCampus;
  d3: VslCampus;
}

export interface VslPlayer {
  player_id: string;
  video_id: string;
  nombre: string;
  desde: string | null;
  hasta: string | null;
  desde_fuente: 'manual' | 'merge' | 'primer_play';
  duracion_seg: number | null;
  pitch_seg: number | null;
  sort: number;
  plays_despues: number | null;
  plays_despues_at: string | null;
  sincronizado_at: string | null;
  dias: VslDay[];
}

export interface VslData {
  generado: string;
  fuente: 'todas' | 'pauta' | 'organico';
  log_desde: string;
  sync: { ultimo: { at: string; ok: boolean; detalle: string } | null; ultimo_ok: string | null };
  players: VslPlayer[];
}

export const fetchVsl = async (fuente: VslData['fuente']) =>
  unwrap(await supabase.rpc('crm_vsl', { p_fuente: fuente })) as VslData;

export async function syncVturb(): Promise<{ ok: boolean; error?: string; falta?: string[]; log?: string[] }> {
  const { data, error } = await supabase.functions.invoke('vturb-sync', { body: { action: 'sync' } });
  if (error) {
    // La función responde JSON también en los errores (falta el token, vTurb caído…).
    const ctx = (error as { context?: Response }).context;
    const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    if (body) return body;
    return { ok: false, error: error.message };
  }
  return data;
}

/** Menos de esto en d1 = «poca muestra». */
export const MIN_VISITAS_D1 = 300;

// ---------- Retención ----------

export interface Retention {
  /** % de los que dieron play que siguen mirando en cada % del video (0…100). */
  curve: (number | null)[];
  at: Record<25 | 50 | 75 | 100, number | null>;
  pitch: number | null;
  /** Base: usuarios en el segundo 0. */
  base: number;
}

/**
 * Suma las curvas de varios días (usuarios por segundo) y la pasa a % del inicio.
 * vTurb da «usuarios en cada segundo» (grouped_timed). Si la serie baja siempre es retención;
 * si no (usuarios que se fueron en ese segundo), se acumula desde el final.
 */
export function retentionOf(days: VslDay[], dur: number | null, pitch: number | null): Retention | null {
  if (!dur) return null;
  const sum = new Map<number, number>();
  for (const d of days) for (const [s, u] of d.curva ?? []) sum.set(s, (sum.get(s) ?? 0) + u);
  if (!sum.size) return null;
  const arr: number[] = Array.from({ length: dur + 1 }, (_, s) => sum.get(s) ?? 0);
  const nonIncreasing = arr.every((v, i) => i === 0 || v <= arr[i - 1] * 1.02 + 1);
  let surv = arr;
  if (!nonIncreasing) {
    surv = [...arr];
    for (let i = surv.length - 2; i >= 0; i--) surv[i] += surv[i + 1];
  }
  const base = Math.max(...surv.slice(0, 3));
  if (base <= 0) return null;
  const pctAt = (sec: number) => Math.min(100, (surv[Math.max(0, Math.min(dur, Math.round(sec)))] / base) * 100);
  const curve = Array.from({ length: 101 }, (_, p) => pctAt(Math.min(dur - 1, (p / 100) * dur)));
  return {
    curve,
    at: { 25: pctAt(dur * 0.25), 50: pctAt(dur * 0.5), 75: pctAt(dur * 0.75), 100: pctAt(dur - 1) },
    pitch: pitch ? pctAt(pitch) : null,
    base,
  };
}

// ---------- Totales de un período ----------

export interface VslTotals {
  dias: number;
  /** Hay datos de vTurb en el período (si no, los números del video van «—»). */
  con_vturb: boolean;
  plays: number | null;
  vistas: number;
  terminaron: number;
  clicks: number;
  sobre_pitch: number;
  visitas_con_video: number;
  play_rate: number | null;
  promedio_visto_seg: number | null;
  pct_pitch: number | null;
  pct_clicks: number | null;
  pct_terminaron: number | null;
  retencion: Retention | null;
  visitas_estimadas: boolean;
  d1: VslCampus & Rates;
  d3: VslCampus & Rates;
}

export interface Rates { conversion: number | null; cal_por_visita: number | null; pct_calificados: number | null; pct_grupo: number | null }

const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
const ratesOf = (c: VslCampus): VslCampus & Rates => ({
  ...c,
  conversion: pct(c.registros, c.visitas),
  cal_por_visita: pct(c.calificados, c.visitas),
  pct_calificados: pct(c.calificados, c.registros),
  pct_grupo: pct(c.grupo, c.registros),
});
const addC = (a: VslCampus, b: VslCampus): VslCampus => ({
  visitas: a.visitas + b.visitas, registros: a.registros + b.registros, calificados: a.calificados + b.calificados, grupo: a.grupo + b.grupo,
});
const ZERO: VslCampus = { visitas: 0, registros: 0, calificados: 0, grupo: 0 };

export function totalsOf(p: VslPlayer, days: VslDay[] = p.dias.filter((d) => d.en_periodo)): VslTotals {
  const s = (k: 'plays' | 'vistas' | 'terminaron' | 'clicks' | 'sobre_pitch' | 'visitas_con_video') => days.reduce((a, d) => a + d[k], 0);
  const conVturb = days.some((d) => d.sincronizado !== null);
  const plays = s('plays');
  const withAvg = days.filter((d) => d.promedio_visto_seg !== null && d.plays > 0);
  const wPlays = withAvg.reduce((a, d) => a + d.plays, 0);
  const pitchOn = (p.pitch_seg ?? 0) > 0;
  return {
    dias: days.length,
    con_vturb: conVturb,
    plays: conVturb ? plays : null,
    vistas: s('vistas'),
    terminaron: s('terminaron'),
    clicks: s('clicks'),
    sobre_pitch: s('sobre_pitch'),
    visitas_con_video: s('visitas_con_video'),
    play_rate: conVturb ? pct(plays, s('visitas_con_video')) : null,
    promedio_visto_seg: wPlays > 0 ? withAvg.reduce((a, d) => a + (d.promedio_visto_seg ?? 0) * d.plays, 0) / wPlays : null,
    pct_pitch: conVturb && pitchOn ? pct(s('sobre_pitch'), plays) : null,
    pct_clicks: conVturb ? pct(s('clicks'), plays) : null,
    pct_terminaron: conVturb ? pct(s('terminaron'), plays) : null,
    retencion: retentionOf(days, p.duracion_seg, pitchOn ? p.pitch_seg : null),
    visitas_estimadas: days.some((d) => d.visitas_estimadas && d.visitas_con_video > 0),
    d1: ratesOf(days.reduce((a, d) => addC(a, d.d1), ZERO)),
    d3: ratesOf(days.reduce((a, d) => addC(a, d.d3), ZERO)),
  };
}

/** El VSL que está ahora en la landing (sin «hasta»), y el anterior. */
export function currentAndPrevious(players: VslPlayer[]) {
  const sorted = [...players].sort((a, b) => Date.parse(b.desde ?? '1970-01-01') - Date.parse(a.desde ?? '1970-01-01'));
  const current = sorted.find((p) => !p.hasta) ?? sorted[0] ?? null;
  const previous = current ? sorted.find((p) => p !== current && p.hasta && current.desde && Date.parse(p.hasta) <= Date.parse(current.desde) + 1000) ?? null : null;
  return { current, previous, sorted };
}

export const fmtSeg = (v: number | null) => {
  if (v === null || !Number.isFinite(v)) return '—';
  const s = Math.round(v);
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`;
};

/** «VSL v1 (19/10)» → «v1». */
export const shortName = (p: VslPlayer) => p.nombre.replace(/^VSL\s+/i, '').replace(/\s*\(.*\)$/, '');

/** Fecha y hora corta en hora Argentina: «15/11 04:59». */
export const arShort = (iso: string | null) => {
  if (!iso) return '?';
  const f = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' });
  return f.format(new Date(iso)).replace(',', '');
};
