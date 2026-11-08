import { useEffect, useRef } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface Watch {
  table: string;
  /** Filtro de Realtime, ej: `launch_id=eq.clase-17-11`. */
  filter?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
}

type Row = Record<string, unknown>;
export type Change = RealtimePostgresChangesPayload<Row>;

let seq = 0;

/**
 * Escucha cambios de la base en tiempo real (Supabase Realtime; respeta RLS: cada uno recibe solo
 * lo que puede leer). `onChanges` se llama con los cambios juntados durante `delayMs`, para no
 * recargar una vez por fila cuando llegan muchos seguidos.
 */
export function useRealtime(watches: Watch[], onChanges: (changes: Change[]) => void, { delayMs = 800, enabled = true } = {}) {
  const cb = useRef(onChanges);
  cb.current = onChanges;
  const key = JSON.stringify(watches);

  useEffect(() => {
    if (!enabled || !watches.length) return;
    let pending: Change[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const batch = pending;
      pending = [];
      if (batch.length) cb.current(batch);
    };
    let channel = supabase.channel(`rt-${++seq}`);
    for (const w of watches) {
      // El tipo de supabase-js solo acepta el evento como literal: los cuatro se comportan igual acá.
      const config = { event: (w.event ?? '*') as '*', schema: 'public', table: w.table, ...(w.filter ? { filter: w.filter } : {}) };
      channel = channel.on('postgres_changes', config, (payload: Change) => {
        pending.push(payload);
        if (!timer) timer = setTimeout(flush, delayMs);
      });
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delayMs, enabled]);
}

/** Atajo: recarga cuando cambia cualquiera de estas tablas. */
export function useLiveReload(tables: (string | Watch)[], reload: () => void, opts?: { delayMs?: number; enabled?: boolean }) {
  useRealtime(tables.map((t) => (typeof t === 'string' ? { table: t } : t)), () => reload(), opts);
}

/** id de la fila que cambió (nueva o borrada). */
export const changedId = (c: Change) => ((c.new as Row | null)?.id ?? (c.old as Row | null)?.id) as string | undefined;
