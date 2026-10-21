import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && key);

// Con valores de relleno la app carga y muestra el aviso de configuración en vez de romperse.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key');

/** Lanza el error de Supabase o devuelve los datos. */
export function unwrap<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}
