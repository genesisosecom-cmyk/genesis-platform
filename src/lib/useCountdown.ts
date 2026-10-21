import { useEffect, useState } from 'react';

/**
 * Segundos que faltan hasta `iso` (0 si ya pasó), actualizado cada segundo.
 * `max` recorta pequeñas diferencias de reloj entre el navegador y el servidor.
 */
export function useCountdown(iso: string | null | undefined, max = Infinity) {
  const calc = () => (iso ? Math.min(max, Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000))) : 0);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    const t = setInterval(() => setLeft(calc()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);
  return left;
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Duración de las contraseñas temporales (debe coincidir con la Edge Function). */
export const TEMP_PASSWORD_SECONDS = 10 * 60;
