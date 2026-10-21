import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Carga datos async con estado de carga/error y una función para recargar.
 * `loading` solo es true en la primera carga (o al cambiar `deps`): al recargar
 * se mantienen los datos anteriores en pantalla hasta que llegan los nuevos.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const lastRun = useRef<unknown>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  useEffect(() => {
    let cancelled = false;
    if (lastRun.current !== run) {
      lastRun.current = run;
      setData(undefined);
    }
    run()
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [run, tick]);

  return { data, error, loading: data === undefined && !error, reload: () => setTick((t) => t + 1) };
}
