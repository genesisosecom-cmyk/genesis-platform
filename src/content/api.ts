import { supabase, unwrap } from '../lib/supabase';
import type { Module, Tool } from '../data/content';

export interface ModuleRow {
  id: string;
  position: number;
  title: string;
  subtitle: string | null;
  published: boolean;
}

export interface SectionRow {
  id: string;
  module_id: string;
  position: number;
  title: string;
}

export interface LessonRow {
  id: string;
  module_id: string;
  section_id: string | null;
  position: number;
  title: string;
  description: string | null;
  video_url: string | null;
  duration_min: number;
  published: boolean;
}

export interface ToolRow {
  id: string;
  position: number;
  name: string;
  description: string | null;
  category: string;
  type: string;
  url: string | null;
  file_path: string | null;
  file_name: string | null;
  published: boolean;
}

export interface LessonResourceRow {
  id: string;
  lesson_id: string;
  position: number;
  title: string;
  description: string | null;
  url: string | null;
  file_path: string | null;
  file_name: string | null;
}

export const TOOLBOX_BUCKET = 'toolbox';

/** Módulos con sus lecciones ordenadas (lo que RLS deje ver: publicados, o todo si es admin). */
export async function fetchModules(): Promise<Module[]> {
  const [mods, lessons, resources, sections] = await Promise.all([
    supabase.from('modules').select('*').order('position').then((r) => unwrap(r) as ModuleRow[]),
    supabase.from('lessons').select('*').order('position').then((r) => unwrap(r) as LessonRow[]),
    supabase.from('lesson_resources').select('*').order('position').then((r) => unwrap(r) as LessonResourceRow[]),
    supabase.from('module_sections').select('*').order('position').then((r) => unwrap(r) as SectionRow[]),
  ]);
  return mods.map((m, i) => {
    const modSections = sections.filter((s) => s.module_id === m.id);
    // Orden de lectura: lecciones sin sección, después cada sección en su orden.
    const rank = (l: LessonRow) => (l.section_id ? modSections.findIndex((s) => s.id === l.section_id) + 1 : 0);
    const modLessons = lessons
      .filter((l) => l.module_id === m.id)
      .map((l) => (l.section_id && !modSections.some((s) => s.id === l.section_id) ? { ...l, section_id: null } : l))
      .sort((a, b) => rank(a) - rank(b) || a.position - b.position);
    return {
      id: m.id,
      number: i + 1,
      title: m.title,
      subtitle: m.subtitle ?? '',
      published: m.published,
      sections: modSections.map((s) => ({ id: s.id, title: s.title })),
      lessons: modLessons
        .map((l) => ({
          id: l.id,
          sectionId: l.section_id,
          title: l.title,
          duration: l.duration_min,
          videoUrl: l.video_url ?? undefined,
          description: l.description ?? undefined,
          published: l.published,
          resources: resources
            .filter((x) => x.lesson_id === l.id)
            .map((x) => ({ id: x.id, title: x.title, description: x.description, url: x.url, filePath: x.file_path, fileName: x.file_name })),
        })),
    };
  });
}

export async function fetchTools(): Promise<Tool[]> {
  const rows = unwrap(await supabase.from('tools').select('*').order('position')) as ToolRow[];
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description ?? '',
    category: t.category,
    type: t.type,
    url: t.url,
    filePath: t.file_path,
    fileName: t.file_name,
    published: t.published,
  }));
}

/** Link temporal (1 hora) para descargar un archivo privado del baúl. */
export async function toolFileUrl(path: string) {
  const { data, error } = await supabase.storage.from(TOOLBOX_BUCKET).createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
