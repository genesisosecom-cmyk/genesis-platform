import { supabase, unwrap } from '../lib/supabase';

// ---------- Etiquetas compartidas del evergreen ----------

export const SUBAVATARS: [string, string][] = [
  ['S1', 'S1 · La marca en breakeven'],
  ['S2', 'S2 · El fundador del tratamiento'],
  ['S3', 'S3 · Vende pero no construye'],
  ['sin_capital', 'Sin capital'],
  ['afuera', 'Afuera del avatar'],
];
/** Subavatar al que le habla una pieza (suma el avatar raíz y el seguidor ideal). */
export const PIECE_SUBAVATARS: [string, string][] = [['S1', 'S1'], ['S2', 'S2'], ['S3', 'S3'], ['raiz', 'Avatar raíz'], ['seguidor', 'Seguidor ideal']];
export const CHANNELS: [string, string][] = [
  ['instagram_dm', 'DM de Instagram'],
  ['instagram_comentario', 'Comentario de Instagram'],
  ['whatsapp', 'WhatsApp'],
  ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'],
  ['otro', 'Otro'],
];
export const LANES: [string, string][] = [['os', 'Llamada de OS'], ['lite', 'Lite (lo decide el closer)'], ['sin_llamada', 'Sin llamada (recurso y YouTube)']];
export const PAINS = Array.from({ length: 10 }, (_, i) => i + 1);
export const labelOf = (list: [string, string][], key: string | null | undefined) => list.find(([k]) => k === key)?.[1] ?? key ?? '—';

// ---------- Registro de contenido ----------

export const FORMATS: [string, string][] = [
  ['youtube', 'YouTube'], ['flywheel', 'Flywheel'], ['reel', 'Reel'], ['trial_reel', 'Trial reel'], ['historias', 'Historias'],
  ['tiktok', 'TikTok'], ['short', 'Clip / Short'], ['mail', 'Mail'], ['whatsapp', 'WhatsApp'], ['post', 'Post'], ['otro', 'Otro'],
];
export const JOBS: [string, string][] = [['atraccion', 'Atracción'], ['nutricion', 'Nutrición'], ['conversion', 'Conversión'], ['conexion', 'Conexión']];
export const PIECE_STATUSES = ['idea', 'guion', 'grabado', 'editado', 'programado', 'publicado', 'descartado'] as const;
export type PieceStatus = (typeof PIECE_STATUSES)[number];
export const CUTS: ['48h' | '7d' | '30d', string, number][] = [['48h', '48 h', 2], ['7d', '7 días', 7], ['30d', '30 días', 30]];

export interface ContentWeek {
  id: string;
  funnel_id: string;
  /** Lunes de la semana (AAAA-MM-DD). */
  week_start: string;
  pain: number | null;
  subavatar: string | null;
  thread: string;
  ask: string;
  ritual_notes: string;
}

export interface ContentPiece {
  id: string;
  funnel_id: string;
  launch_id: string | null;
  week_id: string | null;
  publish_at: string | null;
  format: string;
  job: string | null;
  title: string;
  subavatar: string | null;
  pain: number | null;
  angle: string | null;
  keyword: string | null;
  cta: string | null;
  source_video: string | null;
  variant_of: string | null;
  variable: string | null;
  status: PieceStatus;
  url: string | null;
  responsible_name: string;
  task_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ContentMetric {
  id: string;
  piece_id: string;
  cut: '48h' | '7d' | '30d';
  measured_at: string;
  views: number | null;
  reach: number | null;
  shares: number | null;
  saves: number | null;
  comments: number | null;
  likes: number | null;
  qualified_comments: number | null;
  new_followers: number | null;
  qualified_followers: number | null;
  story_drop_pct: number | null;
  story_replies: number | null;
  avg_view_pct: number | null;
  keyword_conversations: number | null;
}

/** Campos numéricos de una lectura, con su etiqueta y a qué formatos aplican (sin lista = a todos). */
export const METRIC_FIELDS: { key: keyof ContentMetric; label: string; formats?: string[] }[] = [
  { key: 'views', label: 'Vistas' },
  { key: 'reach', label: 'Alcance' },
  { key: 'shares', label: 'Compartidos' },
  { key: 'saves', label: 'Guardados' },
  { key: 'comments', label: 'Comentarios' },
  { key: 'qualified_comments', label: 'Comentarios de S1/S2/S3' },
  { key: 'likes', label: 'Likes' },
  { key: 'new_followers', label: 'Seguidores nuevos' },
  { key: 'qualified_followers', label: 'Seguidores calificados' },
  { key: 'keyword_conversations', label: 'Conversaciones por su palabra' },
  { key: 'story_drop_pct', label: 'Caída entre historias (%)', formats: ['historias'] },
  { key: 'story_replies', label: 'Respuestas', formats: ['historias'] },
  { key: 'avg_view_pct', label: 'Retención promedio (%)', formats: ['youtube', 'flywheel', 'short'] },
];

export interface ResultCounts {
  conversaciones: number;
  calificadas: number;
  aplicaciones: number;
  llamadas: number;
  ventas: number;
  caja: number;
}
export type ContentResult = ResultCounts & { piece_id: string; funnel_id: string };
export type KeywordResult = ResultCounts & { funnel_id: string; keyword: string; semana: string };
export type SubavatarResult = ResultCounts & { subavatar: string; ventas_lite: number };

export interface FunnelOverview {
  funnel: string | null;
  leads: number;
  optins: number;
  calificados: number;
  aplicaciones: number;
  conversaciones: number;
  conversaciones_calificadas: number;
  conversaciones_por_palabra: Record<string, number>;
  llamadas: number;
  cierres: number;
  cierres_os: number;
  cierres_lite: number;
  cierres_por_programa: { programa: string; ventas: number; vendido: number }[];
  cash: number;
}

const inFunnel = <T extends { eq: (c: string, v: string) => T }>(q: T, funnelId: string | null) => (funnelId ? q.eq('funnel_id', funnelId) : q);

export const fetchWeeks = async (funnelId: string | null) =>
  unwrap(await inFunnel(supabase.from('content_weeks').select('*'), funnelId).order('week_start')) as ContentWeek[];
export const fetchPieces = async (funnelId: string | null) =>
  unwrap(await inFunnel(supabase.from('content_pieces').select('*'), funnelId).order('publish_at', { ascending: true, nullsFirst: false }).limit(2000)) as ContentPiece[];
export const fetchMetrics = async () => unwrap(await supabase.from('content_metrics').select('*').limit(5000)) as ContentMetric[];
export const fetchContentResults = async (funnelId: string | null) =>
  unwrap(await inFunnel(supabase.from('content_results').select('piece_id, funnel_id, conversaciones, calificadas, aplicaciones, llamadas, ventas, caja'), funnelId).limit(2000)) as ContentResult[];
export const fetchKeywordResults = async (funnelId: string | null) =>
  unwrap(await inFunnel(supabase.from('keyword_results').select('*'), funnelId).order('semana', { ascending: false })) as KeywordResult[];
export const fetchSubavatarResults = async (funnelId: string, from: string | null = null, to: string | null = null) =>
  unwrap(await supabase.rpc('subavatar_results', { p_funnel: funnelId, p_from: from, p_to: to })) as SubavatarResult[];
export const fetchFunnelOverview = async (funnelId: string | null, from: string | null = null, to: string | null = null) =>
  unwrap(await supabase.rpc('funnel_overview', { p_funnel: funnelId, p_from: from, p_to: to })) as FunnelOverview;

export type PieceInput = Omit<ContentPiece, 'id' | 'created_at' | 'updated_at'>;

export async function savePiece(id: string | null, v: Partial<PieceInput>) {
  if (id) unwrap(await supabase.from('content_pieces').update(v).eq('id', id));
  else unwrap(await supabase.from('content_pieces').insert(v));
}
export const deletePiece = async (id: string) => unwrap(await supabase.from('content_pieces').delete().eq('id', id));

export async function saveWeek(v: Omit<ContentWeek, 'id'>) {
  unwrap(await supabase.from('content_weeks').upsert(v, { onConflict: 'funnel_id,week_start' }));
}

export async function saveMetric(pieceId: string, cut: ContentMetric['cut'], v: Partial<ContentMetric>) {
  unwrap(await supabase.from('content_metrics').upsert({ ...v, piece_id: pieceId, cut, measured_at: new Date().toISOString() }, { onConflict: 'piece_id,cut' }));
}

/** Piezas para elegir «el video que lo trajo» (las ve también el equipo de ventas). */
export const fetchPieceOptions = async (funnelId: string) =>
  unwrap(await supabase.from('content_pieces').select('id, title, format, publish_at, keyword').eq('funnel_id', funnelId).neq('status', 'descartado').order('publish_at', { ascending: false, nullsFirst: false }).limit(500)) as Pick<ContentPiece, 'id' | 'title' | 'format' | 'publish_at' | 'keyword'>[];

// ---------- Fechas ----------

/** Lunes (AAAA-MM-DD) de la semana de una fecha local. */
export function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return isoDay(x);
}
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDaysISO = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
