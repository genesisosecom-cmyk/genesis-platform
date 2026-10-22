import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { Module, Tool } from '../data/content';
import { fetchModules, fetchTools } from './api';

interface ContentContextValue {
  loading: boolean;
  /** Solo lo publicado (lo que ve el alumno), con módulos renumerados. */
  modules: Module[];
  tools: Tool[];
  totalLessons: number;
  findModule: (id: string | undefined) => Module | undefined;
  /** Volver a leer el contenido (después de editarlo en el panel). */
  reload: () => void;
}

const ContentContext = createContext<ContentContextValue | null>(null);

export function ContentProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [allModules, setAllModules] = useState<Module[]>([]);
  const [allTools, setAllTools] = useState<Tool[]>([]);
  // Para qué usuario se cargó el contenido: mientras no coincida con la sesión, está cargando.
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!userId) {
      setAllModules([]);
      setAllTools([]);
      setLoadedFor(null);
      return;
    }
    let cancelled = false;
    Promise.all([fetchModules(), fetchTools()])
      .then(([m, t]) => {
        if (cancelled) return;
        setAllModules(m);
        setAllTools(t);
      })
      .catch((e) => console.error('No se pudo cargar el contenido', e))
      .finally(() => !cancelled && setLoadedFor(userId));
    return () => {
      cancelled = true;
    };
  }, [userId, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const loading = loadedFor !== (userId ?? null);

  const value = useMemo<ContentContextValue>(() => {
    const modules = allModules
      .filter((m) => m.published)
      .map((m, i) => ({ ...m, number: i + 1, lessons: m.lessons.filter((l) => l.published) }));
    return {
      loading,
      modules,
      tools: allTools.filter((t) => t.published),
      totalLessons: modules.reduce((n, m) => n + m.lessons.length, 0),
      findModule: (id) => modules.find((m) => m.id === id),
      reload,
    };
  }, [allModules, allTools, loading, reload]);

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent() {
  const ctx = useContext(ContentContext);
  if (!ctx) throw new Error('useContent debe usarse dentro de <ContentProvider>');
  return ctx;
}
