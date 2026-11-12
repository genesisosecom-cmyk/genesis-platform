/** Tests de landing: datos de crm_landing_tests y cálculos de la pantalla (ganador, grupos, costo, comparación). */
import { supabase, unwrap } from '../../lib/supabase';
import type { MetaState } from './meta';

export interface DayPoint { dia: string; visitas: number; visitas_pauta: number; registros: number; calificados: number; grupo: number }
export interface HourPoint { hora: string; visitas: number; registros: number }

export interface TestVersion {
  code: string;
  nombre: string;
  titular_key: string;
  titular: string;
  bajada: string;
  orden_key: string;
  orden: string;
  sort: number;
  visitas: number;
  visitas_pauta: number;
  visitas_estimadas: boolean;
  rezagados_visitas: number;
  registros: number;
  registros_pauta: number;
  calificados: number;
  calificados_pauta?: number;
  grupo: number;
  rezagados_registros: number;
  serie: DayPoint[];
  horas: HourPoint[];
}

export interface TestEvent { at: string; until: string | null; descripcion: string; variants: string[] | null }

export interface LandingTest {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: 'test' | 'landing';
  inicio: string;
  fin: string | null;
  estable_desde: string | null;
  datos_desde: string | null;
  eventos: TestEvent[];
  versiones: TestVersion[];
}

export interface LandingTestsData {
  log_desde: string;
  solo_visitas_con_hora: boolean;
  generado: string;
  tests: LandingTest[];
  sin_test: { code: string; visitas: number; registros: number }[];
  pauta_por_dia: { dia: string; visitas: number }[];
  anuncios_version: { ad_id: string; code: string; test_id: string; visitas: number }[];
  opciones: { campanas: string[]; contenidos: string[]; anuncios: string[] };
}

export interface TestFilters {
  from: string | null;
  to: string | null;
  fuente: 'todas' | 'pauta' | 'organico';
  campana: string;
  contenido: string;
  anuncio: string;
  estable: boolean;
}

export const fetchLandingTests = async (f: TestFilters) =>
  unwrap(await supabase.rpc('crm_landing_tests', {
    p_from: f.from, p_to: f.to, p_fuente: f.fuente,
    p_utm_campaign: f.campana || null, p_utm_content: f.contenido || null, p_ad_id: f.anuncio || null,
    p_estable: f.estable,
  })) as LandingTestsData;

// ---------- Números de una versión o de un grupo de versiones ----------

export interface Totals {
  visitas: number;
  visitas_pauta: number;
  registros: number;
  registros_pauta: number;
  calificados: number;
  calificados_pauta: number;
  grupo: number;
  estimado: boolean;
  costo: number | null;
}

export const MIN_VISITAS = 100;
export const MIN_REGISTROS = 20;

export function totalsOf(vs: TestVersion[], costo?: Record<string, number> | null): Totals {
  const sum = (k: keyof TestVersion) => vs.reduce((s, v) => s + Number(v[k] ?? 0), 0);
  const calP = vs.reduce((s, v) => s + Number(v.calificados_pauta ?? 0), 0);
  return {
    visitas: sum('visitas'),
    visitas_pauta: sum('visitas_pauta'),
    registros: sum('registros'),
    registros_pauta: sum('registros_pauta'),
    calificados: sum('calificados'),
    calificados_pauta: calP,
    grupo: sum('grupo'),
    estimado: vs.some((v) => v.visitas_estimadas),
    costo: costo ? vs.reduce((s, v) => s + (costo[v.code] ?? 0), 0) : null,
  };
}

const div = (a: number, b: number, k = 100) => (b > 0 ? (a / b) * k : null);

export function rates(t: Totals) {
  return {
    conversion: div(t.registros, t.visitas),
    pct_calificados: div(t.calificados, t.registros),
    calificados_por_visita: div(t.calificados, t.visitas),
    pct_grupo: div(t.grupo, t.registros),
    cpl: t.costo !== null && t.registros_pauta > 0 ? t.costo / t.registros_pauta : null,
    cp_calificado: t.costo !== null && t.calificados_pauta > 0 ? t.costo / t.calificados_pauta : null,
  };
}

export const lowData = (t: Totals) => t.visitas < MIN_VISITAS || t.registros < MIN_REGISTROS;

// ---------- Ganador ----------

/** Función de error (Abramowitz-Stegun 7.1.26, error < 1,5e-7). */
function erf(x: number) {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/** Confianza (1 − p-valor, en %) de que dos proporciones son distintas (prueba z de dos proporciones). */
export function confidence(k1: number, n1: number, k2: number, n2: number): number | null {
  if (n1 <= 0 || n2 <= 0) return null;
  const p = (k1 + k2) / (n1 + n2);
  if (p <= 0 || p >= 1) return null;
  const z = (k1 / n1 - k2 / n2) / Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  const pval = 1 - erf(Math.abs(z) / Math.SQRT2);
  return Math.max(0, Math.min(100, (1 - pval) * 100));
}

export type WinBy = 'conversion' | 'calificados_por_visita';

export interface Winner<K> { key: K; contra: K | null; confianza: number | null; confiable: boolean; pocosDatos: boolean }

/** Mejor elemento por la métrica elegida, con la confianza contra el segundo. */
export function winnerOf<K>(items: { key: K; t: Totals }[], by: WinBy): Winner<K> | null {
  const num = (t: Totals) => (by === 'conversion' ? t.registros : t.calificados);
  const ranked = items.filter((i) => i.t.visitas > 0).sort((a, b) => num(b.t) / b.t.visitas - num(a.t) / a.t.visitas);
  if (!ranked.length) return null;
  const [a, b] = ranked;
  const conf = b ? confidence(num(a.t), a.t.visitas, num(b.t), b.t.visitas) : null;
  const pocos = lowData(a.t) || (b ? lowData(b.t) : true);
  return { key: a.key, contra: b?.key ?? null, confianza: conf, confiable: conf !== null && conf >= 95 && !pocos, pocosDatos: pocos };
}

// ---------- Grupos: por titular y por orden ----------

export function groupBy(vs: TestVersion[], k: 'titular_key' | 'orden_key') {
  const keys = [...new Set(vs.map((v) => v[k]).filter(Boolean))].sort();
  return keys.map((key) => ({ key, versiones: vs.filter((v) => v[k] === key) }));
}

// ---------- Costo estimado por versión ----------

/**
 * Reparte el gasto de pauta de cada día según las visitas de pauta de cada versión ese día.
 * Los anuncios que van a un link fijo de versión (todas sus visitas con hora caen en la misma
 * versión, con 20 o más visitas) se le asignan directo a esa versión.
 */
export function costByVersion(test: LandingTest, data: LandingTestsData, meta: MetaState): { costo: Record<string, number>; fijos: Record<string, string> } | null {
  if (meta.kind !== 'ok') return null;
  const spendDay = new Map(meta.data.por_dia.map((d) => [d.dia, d.spend]));
  const pautaDay = new Map(data.pauta_por_dia.map((d) => [d.dia, Number(d.visitas)]));
  // Anuncios con link fijo
  const byAd = new Map<string, Map<string, number>>();
  for (const a of data.anuncios_version.filter((x) => x.test_id === test.id)) {
    const m = byAd.get(a.ad_id) ?? new Map<string, number>();
    m.set(a.code, (m.get(a.code) ?? 0) + Number(a.visitas));
    byAd.set(a.ad_id, m);
  }
  const fijos: Record<string, string> = {};
  for (const [ad, m] of byAd) {
    const total = [...m.values()].reduce((s, n) => s + n, 0);
    if (m.size === 1 && total >= 20) fijos[ad] = [...m.keys()][0];
  }
  const fixedSpend = new Map<string, Map<string, number>>(); // día → versión → gasto
  for (const ad of meta.data.anuncios) {
    const code = fijos[ad.id];
    if (!code) continue;
    for (const p of ad.serie ?? []) {
      const m = fixedSpend.get(p.dia) ?? new Map<string, number>();
      m.set(code, (m.get(code) ?? 0) + p.spend);
      fixedSpend.set(p.dia, m);
    }
  }
  const costo: Record<string, number> = {};
  for (const v of test.versiones) {
    let c = 0;
    for (const p of v.serie) {
      const spend = spendDay.get(p.dia) ?? 0;
      const fixed = fixedSpend.get(p.dia);
      const fixedTotal = fixed ? [...fixed.values()].reduce((s, n) => s + n, 0) : 0;
      const pauta = pautaDay.get(p.dia) ?? 0;
      if (pauta > 0) c += Math.max(0, spend - fixedTotal) * (Number(p.visitas_pauta) / pauta);
      c += fixed?.get(v.code) ?? 0;
    }
    costo[v.code] = c;
  }
  return { costo, fijos };
}

// ---------- Comparación ----------

export interface CompareSide { visitas: number; registros: number; calificados: number; grupo: number; dias: number }

/** Suma de una versión: en los primeros N días con datos (N = null: todo). */
export function sideOf(v: TestVersion, firstDays: number | null): CompareSide {
  const pts = [...v.serie].sort((a, b) => a.dia.localeCompare(b.dia));
  const used = firstDays ? pts.slice(0, firstDays) : pts;
  return {
    visitas: used.reduce((s, p) => s + Number(p.visitas), 0),
    registros: used.reduce((s, p) => s + Number(p.registros), 0),
    calificados: used.reduce((s, p) => s + Number(p.calificados), 0),
    grupo: used.reduce((s, p) => s + Number(p.grupo), 0),
    dias: used.length,
  };
}

/** Día local d/m o fecha y hora para el eje X por hora. */
export const hourLabel = (h: string) => {
  const d = new Date(h.length <= 19 ? `${h}` : h);
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}h`;
};
