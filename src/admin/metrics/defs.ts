/** Cómo se muestra cada número del panel de pauta: etiqueta, formato, ⓘ y si conviene que suba. */
import { fmtMoney } from '../../lib/format';

export type Fmt = 'num' | 'pct' | 'usd' | 'usd2' | 'x';
export interface Def {
  key: string;
  label: string;
  fmt: Fmt;
  tip: string;
  /** true: subir es bueno · false: bajar es bueno · undefined: neutro (no lleva color). */
  up?: boolean;
}

const n1 = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 1 });

export function fmt(v: unknown, f: Fmt): string {
  if (v === null || v === undefined || v === '') return '—';
  const x = Number(v);
  if (!Number.isFinite(x)) return '—';
  if (f === 'pct') return `${n1(x)}%`;
  if (f === 'usd') return fmtMoney(x, 'USD');
  if (f === 'usd2') return `US$ ${x.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (f === 'x') return x.toLocaleString('es-AR', { maximumFractionDigits: 2 });
  return x.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

const d = (key: string, label: string, f: Fmt, tip: string, up?: boolean): Def => ({ key, label, fmt: f, tip, up });

/** Resumen de «Cómo viene la pauta» (también es la tabla por día). */
export const SUMMARY: Def[] = [
  d('optins', 'Opt-ins', 'num', 'Personas que se registraron en la landing (sin los marcados «No cuentan»).', true),
  d('optins_pauta', 'Opt-ins de pauta', 'num', 'Registros que llegaron desde un anuncio de Meta.', true),
  d('optins_sin_anuncio', 'Opt-ins sin anuncio', 'num', 'Registros que no vinieron de un anuncio (orgánico, bio, directo…).'),
  d('calificados_pauta', 'Calificados de pauta', 'num', 'Registros de pauta que invierten 100 dólares por día o más en Meta.', true),
  d('calificados', 'Calificados totales', 'num', 'Todos los registros que invierten 100 dólares por día o más en Meta.', true),
  d('pct_calificados_pauta', '% calificados de pauta', 'pct', 'Calificados de pauta sobre opt-ins de pauta.', true),
  d('visitas_pauta', 'Visitas de pauta', 'num', 'Visitas a la landing que llegaron desde un anuncio de Meta.', true),
  d('visitas', 'Visitas totales', 'num', 'Todas las visitas a la landing (sin la fuente «Test»).', true),
  d('conversion_landing', 'Conversión de la landing', 'pct', 'Opt-ins de pauta sobre visitas de pauta.', true),
  d('calificados_por_visita', 'Calificados por visita', 'pct', 'Calificados de pauta sobre visitas de pauta.', true),
  d('grupo', 'Entraron al grupo', 'num', 'Registros que tocaron «Entrar al grupo» de WhatsApp.', true),
  d('pct_grupo', '% grupo', 'pct', 'Entraron al grupo sobre todos los opt-ins.', true),
  d('grupo_pauta', 'Grupo (pauta)', 'num', 'Registros de pauta que entraron al grupo de WhatsApp.', true),
  d('pct_grupo_pauta', '% grupo (pauta)', 'pct', 'Entraron al grupo sobre opt-ins de pauta.', true),
  d('tasa_contacto', 'Tasa de contacto', 'pct', 'Opt-ins con al menos un intento de contacto, «¿Contestó?» cargado o etapa avanzada.', true),
  d('pickup', 'Pickup', 'pct', 'Contestaron sobre contactados.', true),
  d('pct_contestaron', '% que contestaron', 'pct', 'Contestaron sobre todos los opt-ins.', true),
  d('calificacion_real', 'Calificación real', 'pct', 'Calificados que la SDR confirmó que califican de verdad, sobre calificados.', true),
  d('tasa_agenda', 'Tasa de agenda', 'pct', 'Calificados que agendaron una call, sobre calificados.', true),
];

/** Los que van en grande arriba. */
export const SUMMARY_KEY = ['optins_pauta', 'calificados_pauta', 'pct_calificados_pauta', 'conversion_landing', 'pct_grupo_pauta', 'tasa_agenda'];

export const FUNNEL_STEPS: Def[] = [
  d('optins', 'Opt-ins', 'num', 'Registros del período.'),
  d('contactados', 'Contactados', 'num', 'Con al menos un intento de contacto, «¿Contestó?» cargado o etapa avanzada.'),
  d('contestaron', 'Contestaron', 'num', 'La SDR marcó que contestaron.'),
  d('calificaron_sdr', 'Calificaron de verdad', 'num', 'La SDR marcó que califican de verdad después de hablar.'),
  d('agendaron', 'Agendaron', 'num', 'Tienen una call agendada con un closer.'),
  d('se_presentaron', 'Se presentaron', 'num', 'Se presentaron a la call (o la call tiene resultado).'),
  d('ventas', 'Ventas', 'num', 'La call terminó en venta.'),
];

/** Arriba o abajo de hoy contra ayer, y si eso es bueno. */
export function trend(def: Def, today: unknown, yesterday: unknown): { dir: 'up' | 'down' | 'same'; good: boolean | null } | null {
  if (today === null || today === undefined || yesterday === null || yesterday === undefined) return null;
  const a = Number(today);
  const b = Number(yesterday);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a === b) return { dir: 'same', good: null };
  const dir = a > b ? 'up' : 'down';
  return { dir, good: def.up === undefined ? null : (dir === 'up') === def.up };
}
