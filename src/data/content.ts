/**
 * Contenido grabado de Genesis.
 *
 * Para cargar el contenido real, editá este archivo: cada lección acepta un
 * `videoUrl` que puede ser un link de YouTube, Vimeo, Loom o un archivo .mp4.
 */

export interface Lesson {
  id: string;
  title: string;
  /** Duración en minutos. */
  duration: number;
  videoUrl?: string;
  description?: string;
}

export interface Module {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  lessons: Lesson[];
}

export type ToolType = 'Plantilla' | 'Recurso' | 'Software' | 'Prompt';

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  type: ToolType;
  url: string;
}

export const MODULES: Module[] = [
  {
    id: 'fundamentos',
    number: 1,
    title: 'Fundamentos',
    subtitle: 'La mentalidad y el sistema detrás de Genesis.',
    lessons: [
      { id: 'bienvenida', title: 'Bienvenida al programa', duration: 8, description: 'Cómo aprovechar la plataforma y qué vas a lograr al terminar.' },
      { id: 'mentalidad', title: 'Mentalidad de operador', duration: 22 },
      { id: 'mapa', title: 'El mapa completo del sistema', duration: 18 },
      { id: 'objetivos', title: 'Definir objetivos medibles', duration: 15 },
    ],
  },
  {
    id: 'oferta',
    number: 2,
    title: 'Oferta y posicionamiento',
    subtitle: 'Construí una oferta que se venda sola.',
    lessons: [
      { id: 'nicho', title: 'Elegir y validar tu nicho', duration: 24 },
      { id: 'avatar', title: 'Cliente ideal y dolores reales', duration: 19 },
      { id: 'oferta-irresistible', title: 'Diseñar una oferta irresistible', duration: 31 },
      { id: 'pricing', title: 'Pricing y paquetes', duration: 17 },
    ],
  },
  {
    id: 'adquisicion',
    number: 3,
    title: 'Adquisición',
    subtitle: 'Sistemas predecibles para generar clientes.',
    lessons: [
      { id: 'contenido', title: 'Contenido que atrae', duration: 26 },
      { id: 'outreach', title: 'Prospección en frío', duration: 28 },
      { id: 'ads', title: 'Introducción a anuncios pagos', duration: 34 },
    ],
  },
  {
    id: 'ventas',
    number: 4,
    title: 'Ventas',
    subtitle: 'Cerrar con confianza y sin presión.',
    lessons: [
      { id: 'llamada', title: 'Estructura de la llamada de venta', duration: 29 },
      { id: 'objeciones', title: 'Manejo de objeciones', duration: 23 },
      { id: 'seguimiento', title: 'Seguimiento que cierra', duration: 14 },
    ],
  },
  {
    id: 'escala',
    number: 5,
    title: 'Operación y escala',
    subtitle: 'Delegá, automatizá y crecé.',
    lessons: [
      { id: 'procesos', title: 'Procesos y SOPs', duration: 21 },
      { id: 'equipo', title: 'Contratar a tu primer equipo', duration: 25 },
      { id: 'automatizacion', title: 'Automatizaciones clave', duration: 27 },
      { id: 'metricas', title: 'Métricas para escalar', duration: 20 },
    ],
  },
];

export const TOOLS: Tool[] = [
  { id: 'plantilla-oferta', name: 'Plantilla de oferta', description: 'Documento guía para estructurar tu oferta paso a paso.', category: 'Oferta', type: 'Plantilla', url: '#' },
  { id: 'calculadora-pricing', name: 'Calculadora de pricing', description: 'Hoja de cálculo para definir precios y márgenes.', category: 'Oferta', type: 'Plantilla', url: '#' },
  { id: 'guion-ventas', name: 'Guion de llamada de venta', description: 'El guion completo usado en el módulo de Ventas.', category: 'Ventas', type: 'Recurso', url: '#' },
  { id: 'objeciones', name: 'Banco de objeciones', description: 'Respuestas listas para las 25 objeciones más comunes.', category: 'Ventas', type: 'Recurso', url: '#' },
  { id: 'secuencia-outreach', name: 'Secuencias de prospección', description: 'Mensajes probados para email, LinkedIn e Instagram.', category: 'Adquisición', type: 'Plantilla', url: '#' },
  { id: 'prompts-contenido', name: 'Prompts de contenido', description: 'Prompts de IA para generar ideas y guiones en minutos.', category: 'Adquisición', type: 'Prompt', url: '#' },
  { id: 'crm', name: 'CRM recomendado', description: 'Configuración sugerida para gestionar tu pipeline.', category: 'Operación', type: 'Software', url: '#' },
  { id: 'sops', name: 'Kit de SOPs', description: 'Plantillas de procesos para delegar desde el día uno.', category: 'Operación', type: 'Plantilla', url: '#' },
  { id: 'dashboard', name: 'Dashboard de métricas', description: 'Tablero para seguir los KPIs del negocio semana a semana.', category: 'Operación', type: 'Plantilla', url: '#' },
];

export function findModule(id: string | undefined) {
  return MODULES.find((m) => m.id === id);
}

export function moduleDuration(module: Module) {
  return module.lessons.reduce((sum, l) => sum + l.duration, 0);
}

export const TOTAL_LESSONS = MODULES.reduce((n, m) => n + m.lessons.length, 0);

export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
