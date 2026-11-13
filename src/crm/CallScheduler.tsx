import { useMemo, useState } from 'react';
import type { SalesRep } from '../lib/types';
import { localToIso } from './api';

const WEEKDAY = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const WEEKDAY_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8 a 22 h
const MINUTES = ['00', '15', '30', '45'];

const pad = (n: number) => String(n).padStart(2, '0');
/** AAAA-MM-DD del día local, n días desde hoy. */
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
};
const fromKey = (k: string) => new Date(`${k}T12:00:00`);
const dayLabel = (k: string, today: string, tomorrow: string) => {
  const d = fromKey(k);
  const dm = `${d.getDate()}/${d.getMonth() + 1}`;
  if (k === today) return { top: 'Hoy', sub: dm };
  if (k === tomorrow) return { top: 'Mañana', sub: dm };
  return { top: WEEKDAY[d.getDay()], sub: dm };
};

/** Agendar la call con un closer: closer, día y hora con botones, y un resumen antes de confirmar. */
export default function CallScheduler({ closers, busy, onSubmit }: { closers: SalesRep[]; busy: boolean; onSubmit: (closerId: string, iso: string) => void }) {
  const [closerId, setCloserId] = useState(closers.length === 1 ? closers[0].id : '');
  const [day, setDay] = useState('');
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState('00');

  const today = dayKey(addDays(0));
  const tomorrow = dayKey(addDays(1));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayKey(addDays(i))), [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const otherDay = day && !days.includes(day) ? day : '';

  const local = day && hour !== null ? `${day}T${pad(hour)}:${minute}` : '';
  const past = local ? new Date(local).getTime() < Date.now() : false;
  const closer = closers.find((c) => c.id === closerId);
  const ready = Boolean(closerId && local && !past);

  return (
    <div className="sched">
      <div className="sched__row">
        <span className="sched__label">Closer</span>
        <div className="sched__opts">
          {closers.length === 0 && <span className="muted">No hay closers activos.</span>}
          {closers.map((c) => (
            <button key={c.id} type="button" className={`sched__opt${closerId === c.id ? ' is-on' : ''}`} aria-pressed={closerId === c.id} onClick={() => setCloserId(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="sched__row">
        <span className="sched__label">Día</span>
        <div className="sched__opts sched__days">
          {days.map((k) => {
            const l = dayLabel(k, today, tomorrow);
            return (
              <button key={k} type="button" className={`sched__opt sched__day${day === k ? ' is-on' : ''}`} aria-pressed={day === k} onClick={() => setDay(k)}>
                <b className="sched__wd">{l.top}</b>
                <small>{l.sub}</small>
              </button>
            );
          })}
          <label className={`sched__opt sched__day sched__other${otherDay ? ' is-on' : ''}`}>
            <b>Otro día</b>
            <input type="date" min={today} value={otherDay} onChange={(e) => setDay(e.target.value)} aria-label="Elegir otro día" />
          </label>
        </div>
      </div>

      <div className="sched__row">
        <span className="sched__label">Hora</span>
        <div className="sched__time">
          <div className="sched__opts">
            {HOURS.map((h) => {
              const isPast = day === today && new Date(`${day}T${pad(h)}:59`).getTime() < Date.now();
              return (
                <button key={h} type="button" disabled={isPast} className={`sched__opt sched__hour${hour === h ? ' is-on' : ''}`} aria-pressed={hour === h} onClick={() => setHour(h)}>
                  {pad(h)}
                </button>
              );
            })}
          </div>
          <div className="seg sched__min" role="group" aria-label="Minutos">
            {MINUTES.map((m) => (
              <button key={m} type="button" className={`seg__opt${minute === m ? ' is-on' : ''}`} aria-pressed={minute === m} onClick={() => setMinute(m)}>:{m}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="sched__foot">
        <span className={past ? 'sched__warn' : 'muted'}>
          {past
            ? 'Ese horario ya pasó: elegí otro.'
            : closer && local
              ? <>Call con <b>{closer.name}</b> el <b>{WEEKDAY_LONG[fromKey(day).getDay()]} {fromKey(day).getDate()}/{fromKey(day).getMonth() + 1}</b> a las <b>{pad(hour!)}:{minute}</b></>
              : `Falta elegir ${[!closerId && 'el closer', !day && 'el día', hour === null && 'la hora'].filter(Boolean).join(', ')}.`}
        </span>
        <button className="btn btn--primary btn--sm" disabled={busy || !ready} onClick={() => onSubmit(closerId, localToIso(local)!)}>
          {busy ? 'Agendando…' : 'Agendar'}
        </button>
      </div>
    </div>
  );
}
