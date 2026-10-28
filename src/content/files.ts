import { supabase } from '../lib/supabase';
import { TOOLBOX_BUCKET, toolFileUrl } from './api';

/** Límite por archivo del plan free de Supabase. */
export const MAX_FILE_MB = 50;

export const fileSize = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

export const tooBig = (f: File) => f.size > MAX_FILE_MB * 1024 * 1024;

/** Nombre de archivo seguro para la ruta en Storage (sin acentos ni espacios). */
export const safeName = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'archivo';

/** Sube un archivo al bucket privado y devuelve su ruta. */
export async function uploadFile(file: File, prefix = '') {
  const path = `${prefix}${crypto.randomUUID()}/${safeName(file.name)}`;
  const { error } = await supabase.storage.from(TOOLBOX_BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeFiles(paths: (string | null | undefined)[]) {
  const list = paths.filter(Boolean) as string[];
  if (list.length) await supabase.storage.from(TOOLBOX_BUCKET).remove(list);
}

/** Abre un archivo privado (link temporal) o un link externo en otra pestaña. */
export async function openFileOrLink(item: { filePath?: string | null; url?: string | null }) {
  if (item.filePath) {
    // La pestaña se abre antes del await para que el navegador no la bloquee.
    const win = window.open('', '_blank');
    try {
      const url = await toolFileUrl(item.filePath);
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch {
      win?.close();
      window.alert('No se pudo abrir el archivo. Probá de nuevo.');
    }
  } else if (item.url) {
    window.open(item.url, '_blank', 'noopener');
  }
}
