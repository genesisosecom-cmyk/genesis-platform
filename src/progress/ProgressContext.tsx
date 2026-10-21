import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import type { LessonProgressRow } from '../lib/types';
import { MODULES, TOTAL_LESSONS, type Module } from '../data/content';

interface LastWatched {
  moduleId: string;
  lessonId: string;
}

interface ProgressContextValue {
  lastWatched: LastWatched | null;
  isCompleted: (moduleId: string, lessonId: string) => boolean;
  toggleCompleted: (moduleId: string, lessonId: string) => void;
  markWatched: (moduleId: string, lessonId: string) => void;
  moduleProgress: (module: Module) => { done: number; total: number; percent: number };
  overallPercent: number;
  completedCount: number;
}

const key = (moduleId: string, lessonId: string) => `${moduleId}/${lessonId}`;

/** Calcula el avance de un conjunto de filas (también lo usa el panel de admin). */
export function summarizeProgress(rows: Pick<LessonProgressRow, 'module_id' | 'lesson_id' | 'completed'>[]) {
  const done = new Set(rows.filter((r) => r.completed).map((r) => key(r.module_id, r.lesson_id)));
  const perModule = MODULES.map((m) => {
    const d = m.lessons.filter((l) => done.has(key(m.id, l.id))).length;
    return { module: m, done: d, total: m.lessons.length, percent: Math.round((d / m.lessons.length) * 100) };
  });
  const completedCount = perModule.reduce((n, m) => n + m.done, 0);
  return {
    done,
    perModule,
    completedCount,
    overallPercent: TOTAL_LESSONS ? Math.round((completedCount / TOTAL_LESSONS) * 100) : 0,
  };
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [rows, setRows] = useState<Record<string, LessonProgressRow>>({});

  useEffect(() => {
    setRows({});
    if (!userId) return;
    supabase
      .from('lesson_progress')
      .select('*')
      .eq('user_id', userId)
      .then(({ data }) => {
        const map: Record<string, LessonProgressRow> = {};
        for (const r of (data ?? []) as LessonProgressRow[]) map[key(r.module_id, r.lesson_id)] = r;
        setRows(map);
      });
  }, [userId]);

  // Ref con el último estado para armar la fila a guardar sin efectos dentro de setState.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const save = useCallback(
    (moduleId: string, lessonId: string, patch: Partial<LessonProgressRow>) => {
      if (!userId) return;
      const k = key(moduleId, lessonId);
      const base: LessonProgressRow = rowsRef.current[k] ?? {
        user_id: userId,
        module_id: moduleId,
        lesson_id: lessonId,
        completed: false,
        completed_at: null,
        last_watched_at: null,
      };
      const next = { ...base, ...patch };
      setRows((prev) => ({ ...prev, [k]: next }));
      supabase
        .from('lesson_progress')
        .upsert(next)
        .then(({ error }) => error && console.error('No se pudo guardar el progreso', error));
    },
    [userId],
  );

  const value = useMemo<ProgressContextValue>(() => {
    const list = Object.values(rows);
    const summary = summarizeProgress(list);
    const last = list
      .filter((r) => r.last_watched_at)
      .sort((a, b) => (a.last_watched_at! < b.last_watched_at! ? 1 : -1))[0];
    return {
      lastWatched: last ? { moduleId: last.module_id, lessonId: last.lesson_id } : null,
      isCompleted: (m, l) => summary.done.has(key(m, l)),
      toggleCompleted: (m, l) => {
        const completed = !summary.done.has(key(m, l));
        save(m, l, { completed, completed_at: completed ? new Date().toISOString() : null });
      },
      markWatched: (m, l) => save(m, l, { last_watched_at: new Date().toISOString() }),
      moduleProgress: (module) => {
        const p = summary.perModule.find((x) => x.module.id === module.id);
        return { done: p?.done ?? 0, total: module.lessons.length, percent: p?.percent ?? 0 };
      },
      completedCount: summary.completedCount,
      overallPercent: summary.overallPercent,
    };
  }, [rows, save]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress debe usarse dentro de <ProgressProvider>');
  return ctx;
}
