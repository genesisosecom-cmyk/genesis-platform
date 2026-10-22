import { supabase, unwrap } from '../lib/supabase';
import type { Module, Tool } from '../data/content';

export interface ModuleRow {
  id: string;
  position: number;
  title: string;
  subtitle: string | null;
  published: boolean;
}

export interface LessonRow {
  id: string;
  module_id: string;
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

export const TOOLBOX_BUCKET = 'toolbox';

/** Módulos con sus lecciones ordenadas (lo que RLS deje ver: publicados, o todo si es admin). */
export async function fetchModules(): Promise<Module[]> {
  const [mods, lessons] = await Promise.all([
    supabase.from('modules').select('*').order('position').then((r) => unwrap(r) as ModuleRow[]),
    supabase.from('lessons').select('*').order('position').then((r) => unwrap(r) as LessonRow[]),
  ]);
  return mods.map((m, i) => ({
    id: m.id,
    number: i + 1,
    title: m.title,
    subtitle: m.subtitle ?? '',
    published: m.published,
    lessons: lessons
      .filter((l) => l.module_id === m.id)
      .map((l) => ({
        id: l.id,
        title: l.title,
        duration: l.duration_min,
        videoUrl: l.video_url ?? undefined,
        description: l.description ?? undefined,
        published: l.published,
      })),
  }));
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
