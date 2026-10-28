/**
 * Tipos y utilidades del contenido del campus. El contenido en sí vive en
 * Supabase (tablas modules, lessons y tools) y se administra desde el panel.
 */

export interface LessonResource {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  filePath: string | null;
  fileName: string | null;
}

export interface ModuleSection {
  id: string;
  title: string;
}

export interface Lesson {
  id: string;
  /** Sección del módulo a la que pertenece (null = sin sección). */
  sectionId: string | null;
  title: string;
  /** Duración en minutos. */
  duration: number;
  videoUrl?: string;
  description?: string;
  published: boolean;
  resources: LessonResource[];
}

export interface Module {
  id: string;
  /** Número visible (orden dentro del campus, empieza en 1). */
  number: number;
  title: string;
  subtitle: string;
  published: boolean;
  /** Secciones en orden. Las lecciones vienen ordenadas: primero las sin sección y después sección por sección. */
  sections: ModuleSection[];
  lessons: Lesson[];
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  type: string;
  url: string | null;
  filePath: string | null;
  fileName: string | null;
  published: boolean;
}

export const TOOL_TYPES = ['Plantilla', 'Recurso', 'Software', 'Prompt', 'Video'];

export function moduleDuration(module: Module) {
  return module.lessons.reduce((sum, l) => sum + l.duration, 0);
}

export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
