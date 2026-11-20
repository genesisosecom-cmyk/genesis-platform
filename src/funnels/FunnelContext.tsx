import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { supabase, unwrap } from '../lib/supabase';
import type { Funnel, Launch } from '../lib/types';

/** 'all' = Todos los funnels. */
export type FunnelChoice = 'all' | string;

interface Stored {
  funnel: FunnelChoice;
  /** Último ciclo elegido en cada funnel. */
  cycles: Record<string, string>;
}

interface FunnelContextValue {
  loading: boolean;
  error: string | null;
  funnels: Funnel[];
  launches: Launch[];
  /** Funnel elegido en el selector ('all' = Todos). */
  funnelId: FunnelChoice;
  funnel: Funnel | null;
  setFunnel: (id: FunnelChoice) => void;
  /** Ciclo en uso: el elegido dentro del funnel; con «Todos», el actual del primer funnel. */
  launch: Launch | null;
  setLaunch: (id: string) => void;
  /** Ciclos del funnel elegido (con «Todos», todos). */
  cycles: Launch[];
  funnelOf: (launchId: string | null | undefined) => Funnel | null;
  currentOf: (funnelId: string) => Launch | null;
  reload: () => void;
}

const Ctx = createContext<FunnelContextValue | null>(null);
const KEY = (userId: string) => `funnel-choice:${userId}`;

function read(userId: string | null): Stored {
  try {
    const v = userId ? JSON.parse(localStorage.getItem(KEY(userId)) ?? 'null') : null;
    if (v && typeof v.funnel === 'string') return { funnel: v.funnel, cycles: v.cycles ?? {} };
  } catch {
    /* sin storage: arranca en Todos */
  }
  return { funnel: 'all', cycles: {} };
}

/** Los ciclos más nuevos primero; los que no tienen fecha (evergreen) por fecha de alta. */
const byDate = (a: Launch, b: Launch) => (b.starts_at ?? b.created_at).localeCompare(a.starts_at ?? a.created_at);

/**
 * Funnels, ciclos y la elección del usuario (se guarda por usuario en el navegador).
 * Solo carga datos para el equipo (admin, SDR, closer): los alumnos no ven funnels.
 */
export function FunnelProvider({ children }: { children: ReactNode }) {
  const { profile, isAdmin, isSdr, isCloser } = useAuth();
  const userId = profile?.id ?? null;
  const team = isAdmin || isSdr || isCloser;
  const [data, setData] = useState<{ funnels: Funnel[]; launches: Launch[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [stored, setStored] = useState<Stored>(() => read(userId));

  useEffect(() => setStored(read(userId)), [userId]);

  useEffect(() => {
    if (!team) {
      setData(null);
      return;
    }
    let cancelled = false;
    Promise.all([supabase.from('funnels').select('*').order('sort'), supabase.from('launches').select('*')])
      .then(([f, l]) => {
        if (cancelled) return;
        setData({ funnels: unwrap(f) as Funnel[], launches: (unwrap(l) as Launch[]).sort(byDate) });
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [team, userId, tick]);

  const save = useCallback(
    (next: Stored) => {
      setStored(next);
      try {
        if (userId) localStorage.setItem(KEY(userId), JSON.stringify(next));
      } catch {
        /* sin storage: vale solo para esta sesión */
      }
    },
    [userId],
  );

  const value = useMemo<FunnelContextValue>(() => {
    const funnels = (data?.funnels ?? []).filter((f) => f.active);
    const launches = data?.launches ?? [];
    const funnel = funnels.find((f) => f.id === stored.funnel) ?? null;
    const funnelId: FunnelChoice = funnel ? funnel.id : 'all';
    const cycles = funnel ? launches.filter((l) => l.funnel_id === funnel.id) : launches;
    const currentOf = (id: string) => launches.find((l) => l.funnel_id === id && l.is_current) ?? launches.find((l) => l.funnel_id === id) ?? null;
    // Con «Todos», el ciclo por defecto es el actual del primer funnel (hoy, el webinar): igual que antes.
    const fallback = funnel ? currentOf(funnel.id) : funnels.map((f) => currentOf(f.id)).find(Boolean) ?? launches[0] ?? null;
    const launch = cycles.find((l) => l.id === stored.cycles[funnelId]) ?? fallback;
    return {
      loading: team && !data && !error,
      error,
      funnels,
      launches,
      funnelId,
      funnel,
      setFunnel: (id) => save({ ...stored, funnel: id }),
      launch,
      setLaunch: (id) => save({ ...stored, cycles: { ...stored.cycles, [funnelId]: id } }),
      cycles,
      funnelOf: (launchId) => funnels.find((f) => f.id === launches.find((l) => l.id === launchId)?.funnel_id) ?? null,
      currentOf,
      reload: () => setTick((t) => t + 1),
    };
  }, [data, error, stored, save, team]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFunnels() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFunnels va adentro de <FunnelProvider>');
  return v;
}

/**
 * Selector de funnel (Todos · Webinars · Evergreen orgánico) y, dentro de un funnel, de ciclo.
 * Va arriba en el panel de admin y en los paneles de SDR y closer.
 */
export function FunnelSwitcher({ compact }: { compact?: boolean }) {
  const { funnels, funnelId, setFunnel, cycles, launch, setLaunch, loading } = useFunnels();
  if (loading || !funnels.length) return null;
  return (
    <div className={`fswitch${compact ? ' fswitch--compact' : ''}`} role="group" aria-label="Funnel">
      <div className="seg">
        <button type="button" className={`seg__opt${funnelId === 'all' ? ' is-on' : ''}`} onClick={() => setFunnel('all')}>Todos</button>
        {funnels.map((f) => (
          <button key={f.id} type="button" className={`seg__opt${funnelId === f.id ? ' is-on' : ''}`} onClick={() => setFunnel(f.id)}>{f.name}</button>
        ))}
      </div>
      {launch && cycles.length > 0 && (funnelId !== 'all' || cycles.length > 1) && (
        <select className="field field--select fswitch__cycle" value={launch.id} onChange={(e) => setLaunch(e.target.value)} aria-label="Ciclo">
          {cycles.map((l) => (
            <option key={l.id} value={l.id}>{l.name}{l.is_current ? ' (actual)' : ''}</option>
          ))}
        </select>
      )}
    </div>
  );
}
