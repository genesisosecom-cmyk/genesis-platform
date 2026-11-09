/** Datos de Meta Ads que devuelve la función edge `meta-ads` (el token nunca llega acá). */
import { supabase } from '../../lib/supabase';

export interface MetaStats {
  spend: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks: number;
  lpv: number;
}
export interface Outcomes {
  optins: number;
  calificados: number;
  grupo: number;
  agendas: number;
  ventas: number;
}
export type Entrega = 'Activo' | 'En revisión' | 'Rechazado' | 'Con problemas' | 'Apagado';
export interface MetaNode extends MetaStats, Outcomes {
  id: string;
  nombre: string;
  entrega: Entrega;
  estado: string;
  presupuesto_diario: number | null;
  campaign_id?: string;
  adset_id?: string;
  lead_ids?: string[];
  serie?: (MetaStats & { dia: string; optins: number; calificados: number })[];
}
export interface MetaLead {
  nombre: string;
  fecha: string;
  inversion: string | null;
  stage: string;
  califica: boolean;
  compro: boolean;
}
export interface MetaInsights {
  ok: true;
  cuenta: string;
  desde: string;
  hasta: string;
  cache: boolean;
  actualizado: string;
  total: MetaStats & { optins: number; calificados: number; grupo: number };
  por_dia: (MetaStats & { dia: string })[];
  estados: { activos: number; en_revision: number; rechazados: number; con_problemas: number };
  campanas: MetaNode[];
  conjuntos: MetaNode[];
  anuncios: MetaNode[];
  sin_cruzar: Outcomes & { motivos: { sin_datos: number; no_encontrado: number; ambiguo: number }; lead_ids: string[] };
  leads: Record<string, MetaLead>;
}
export interface Creative {
  id: string;
  nombre: string;
  miniatura: string | null;
  imagen: string | null;
  video_id: string | null;
  tipo: string | null;
}

/** Estado de la conexión: lista para usar, faltan secretos, la función no está o falló. */
export type MetaState =
  | { kind: 'ok'; data: MetaInsights }
  | { kind: 'falta'; falta: string[] }
  | { kind: 'sin_funcion' }
  | { kind: 'error'; error: string };

async function call<T>(body: Record<string, unknown>): Promise<T | { ok: false; falta?: string[]; error?: string } | null> {
  const { data, error } = await supabase.functions.invoke('meta-ads', { body });
  if (error) {
    // 404: la función todavía no se desplegó. Otros: el detalle viene en el cuerpo.
    const res = (error as { context?: Response }).context;
    if (res && res.status === 404) return null;
    try {
      const b = await res?.json();
      if (b && typeof b === 'object') return { ok: false, ...b };
    } catch {
      /* sin cuerpo */
    }
    if (!res) return null;
    return { ok: false, error: error.message };
  }
  return data as T;
}

export async function fetchMeta(launch: string, since: string, until: string, refresh = false): Promise<MetaState> {
  const r = await call<MetaInsights>({ action: 'insights', launch, since, until, refresh });
  if (r === null) return { kind: 'sin_funcion' };
  if (!r.ok) {
    if (r.falta?.length) return { kind: 'falta', falta: r.falta };
    return { kind: 'error', error: r.error ?? 'Error desconocido' };
  }
  return { kind: 'ok', data: r as MetaInsights };
}

export async function fetchCreatives(): Promise<Record<string, Creative>> {
  const r = await call<{ ok: true; creativos: Creative[] }>({ action: 'creativos' });
  if (!r || !r.ok) return {};
  return Object.fromEntries((r as { creativos: Creative[] }).creativos.map((c) => [c.id, c]));
}

/** Métricas que salen de combinar Meta con los leads. null = sin base. */
export function derive(s: Partial<MetaStats & Outcomes>) {
  const div = (a?: number | null, b?: number | null, k = 1) => (a !== undefined && a !== null && b ? (a / b) * k : null);
  return {
    cpl: div(s.spend, s.optins),
    cpl_calificado: div(s.spend, s.calificados),
    cpm: div(s.spend, s.impressions, 1000),
    ctr: div(s.clicks, s.impressions, 100),
    clic_landing: div(s.lpv, s.clicks, 100),
    conversion: div(s.optins, s.lpv, 100),
    pct_calificado: div(s.calificados, s.optins, 100),
    pct_grupo: div(s.grupo, s.optins, 100),
  };
}
