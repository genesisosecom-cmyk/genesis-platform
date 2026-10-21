import { supabase } from './supabase';

export interface TempCredentials {
  id: string;
  email: string;
  password: string;
  expires_at: string;
}

/** Llama a la Edge Function `admin-users` y devuelve el mensaje de error del servidor si falla. */
export async function adminUsers<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? ((await ctx.json().catch(() => null)) as { error?: string } | null)?.error : null;
    throw new Error(msg ?? error.message);
  }
  return data as T;
}
