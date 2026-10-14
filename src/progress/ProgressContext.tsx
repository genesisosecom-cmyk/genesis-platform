import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { MODULES, TOTAL_LESSONS, type Module } from '../data/content';

interface LastWatched {
  moduleId: string;
  lessonId: string;
  at: number;
}

interface ProgressState {
  completed: string[];
  lastWatched: LastWatched | null;
}

interface ProgressContextValue extends ProgressState {
  isCompleted: (moduleId: string, lessonId: string) => boolean;
  toggleCompleted: (moduleId: string, lessonId: string) => void;
  markWatched: (moduleId: string, lessonId: string) => void;
  moduleProgress: (module: Module) => { done: number; total: number; percent: number };
  overallPercent: number;
  completedCount: number;
}

const EMPTY: ProgressState = { completed: [], lastWatched: null };
const key = (moduleId: string, lessonId: string) => `${moduleId}/${lessonId}`;
const storageKey = (userId: string) => `genesis.progress.${userId}`;

function load(userId: string | undefined): ProgressState {
  if (!userId) return EMPTY;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as ProgressState) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<ProgressState>(() => load(user?.id));

  useEffect(() => setState(load(user?.id)), [user?.id]);

  const update = useCallback(
    (fn: (s: ProgressState) => ProgressState) => {
      setState((prev) => {
        const next = fn(prev);
        if (user) localStorage.setItem(storageKey(user.id), JSON.stringify(next));
        return next;
      });
    },
    [user],
  );

  const value = useMemo<ProgressContextValue>(() => {
    const done = new Set(state.completed);
    const completedCount = MODULES.reduce(
      (n, m) => n + m.lessons.filter((l) => done.has(key(m.id, l.id))).length,
      0,
    );
    return {
      ...state,
      isCompleted: (m, l) => done.has(key(m, l)),
      toggleCompleted: (m, l) =>
        update((s) => {
          const k = key(m, l);
          const completed = s.completed.includes(k) ? s.completed.filter((x) => x !== k) : [...s.completed, k];
          return { ...s, completed };
        }),
      markWatched: (m, l) => update((s) => ({ ...s, lastWatched: { moduleId: m, lessonId: l, at: Date.now() } })),
      moduleProgress: (module) => {
        const total = module.lessons.length;
        const d = module.lessons.filter((l) => done.has(key(module.id, l.id))).length;
        return { done: d, total, percent: total ? Math.round((d / total) * 100) : 0 };
      },
      completedCount,
      overallPercent: TOTAL_LESSONS ? Math.round((completedCount / TOTAL_LESSONS) * 100) : 0,
    };
  }, [state, update]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress debe usarse dentro de <ProgressProvider>');
  return ctx;
}
