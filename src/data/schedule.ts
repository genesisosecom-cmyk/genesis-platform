import type { ClassSlot } from '../lib/types';

/** Programas en orden de la escalera de valor. */
export const PROGRAMS = ['Genesis OG', 'Fast Subscription', 'Genesis OS'] as const;

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function slotLabel(slot: Pick<ClassSlot, 'kind' | 'weekday' | 'start_time' | 'coach'>) {
  if (slot.kind === '1:1') return `1:1 con ${slot.coach}`;
  return `${WEEKDAYS[(slot.weekday ?? 1) - 1]} ${slot.start_time}hs · ${slot.coach}`;
}

export function sortSlots(slots: ClassSlot[]) {
  return [...slots].sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'grupal' ? -1 : 1) ||
      (a.weekday ?? 9) - (b.weekday ?? 9) ||
      (a.start_time ?? '').localeCompare(b.start_time ?? '') ||
      a.coach.localeCompare(b.coach),
  );
}

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/**
 * Próximas fechas de una clase semanal. Hoy cuenta si todavía no pasaron
 * 2 horas desde el inicio (así sirve para quien completa justo antes de entrar).
 */
export function upcomingDates(slot: Pick<ClassSlot, 'weekday' | 'start_time'>, count = 2, now = new Date()) {
  if (!slot.weekday) return [];
  const [h, m] = (slot.start_time ?? '00:00').split(':').map(Number);
  const todayWd = ((now.getDay() + 6) % 7) + 1; // 1 = lunes
  let offset = (slot.weekday - todayWd + 7) % 7;
  if (offset === 0) {
    const end = new Date(now);
    end.setHours(h + 2, m, 0, 0);
    if (now > end) offset = 7;
  }
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + offset + i * 7);
    return {
      iso: iso(d),
      label: `${WEEKDAYS[slot.weekday! - 1]}${offset === 0 && i === 0 ? ' (hoy)' : ''}`,
      short: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
    };
  });
}
