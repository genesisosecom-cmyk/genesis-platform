import { useMemo, useState } from 'react';
import ProgressBar from '../components/ProgressBar';
import { Kpi, Pill } from '../admin/ui';
import { fmtMoney } from '../lib/format';
import type { Commission, Launch, LaunchProgress, SalesCall, SalesRep } from '../lib/types';
import type { CallRow } from './api';
import { CALL_STATE, callState, localDay, simulate, type SimInput } from './model';

const usd = (n: number) => fmtMoney(n, 'USD');

/** Cabecera del lanzamiento: cash contra la meta, lo que falta, días al cierre y el día de hoy. */
export function LaunchGoal({ launch, progress }: { launch: Launch; progress: LaunchProgress | null }) {
  if (!progress) return null;
  const goal = Number(launch.cash_goal ?? 0);
  const daily = Number(launch.daily_cash_goal ?? 0);
  const cash = Number(progress.cash);
  const today = Number(progress.cash_today);
  const pct = goal ? Math.min(100, Math.round((cash / goal) * 100)) : 0;
  const days = launch.sales_close_at ? Math.ceil((Date.parse(`${launch.sales_close_at}T23:59:59`) - Date.now()) / 86400000) : null;
  return (
    <section className="glass panel goal">
      <div className="goal__top">
        <div>
          <span className="eyebrow">{launch.name}</span>
          <div className="goal__cash">
            {usd(cash)} {goal > 0 && <span className="muted">/ {usd(goal)}</span>}
          </div>
        </div>
        <div className="goal__side">
          {goal > 0 && <span><strong>{pct}%</strong> de la meta</span>}
          {goal > 0 && <span>Faltan <strong>{usd(Math.max(0, goal - cash))}</strong></span>}
          {days !== null && <span>{days > 0 ? <><strong>{days}</strong> {days === 1 ? 'día' : 'días'} al cierre</> : 'Cerró el lanzamiento'}</span>}
        </div>
      </div>
      {goal > 0 ? <ProgressBar percent={pct} /> : <p className="muted">El admin todavía no cargó la meta de este lanzamiento.</p>}
      <div className="goal__today">
        <span>Hoy: <strong>{usd(today)}</strong>{daily > 0 && <span className="muted"> / {usd(daily)}</span>}</span>
        {daily > 0 && <span className={today >= daily ? 'text-ok' : 'muted'}>{Math.round((today / daily) * 100)}% de la meta diaria</span>}
        <span><strong>{progress.sales}</strong> {progress.sales === 1 ? 'venta' : 'ventas'}{progress.sales_today ? ` · ${progress.sales_today} hoy` : ''}</span>
      </div>
    </section>
  );
}

export function ScopeToggle({ value, onChange }: { value: 'mine' | 'team'; onChange: (v: 'mine' | 'team') => void }) {
  return (
    <div className="seg">
      <button type="button" className={`seg__opt${value === 'mine' ? ' is-on' : ''}`} onClick={() => onChange('mine')}>Míos</button>
      <button type="button" className={`seg__opt${value === 'team' ? ' is-on' : ''}`} onClick={() => onChange('team')}>Todo el equipo</button>
    </div>
  );
}

/** Comisión del período, con lo pendiente de cobrar (cuotas). */
export function CommissionCards({ rows, pct }: { rows: Commission[]; pct: number }) {
  const earned = rows.reduce((s, r) => s + Number(r.earned), 0);
  const pending = rows.reduce((s, r) => s + Number(r.pending), 0);
  const cash = rows.reduce((s, r) => s + Number(r.cash), 0);
  const sales = rows.reduce((s, r) => s + Number(r.sales), 0);
  return (
    <div className="kpis kpis--4">
      <Kpi label="Tu comisión" value={usd(earned)} tone="ok" hint={`${pct}% del cash cobrado`} />
      <Kpi label="Pendiente de cobrar" value={usd(pending)} hint="Comisión de las cuotas que faltan" />
      <Kpi label="Con lo pendiente" value={usd(earned + pending)} />
      <Kpi label="Ventas" value={sales} hint={`${usd(cash)} cobrados`} />
    </div>
  );
}

/** Simulador: cambiá los números y mirá la comisión proyectada a 30 días. */
export function Simulator({ mode, real, pct }: { mode: 'sdr' | 'closer'; real: SimInput; pct: number }) {
  const [v, setV] = useState(real);
  const r = simulate(v, pct);
  const base = simulate(real, pct);
  const fields: [keyof SimInput, string, string][] =
    mode === 'sdr'
      ? [['dialsPerDay', 'Dials por día', ''], ['answerRate', '% que contestan', '%'], ['bookRate', '% que agendan', '%'], ['showRate', 'Show-up', '%'], ['closeRate', 'Cierre', '%'], ['ticket', 'Ticket', 'USD']]
      : [['dialsPerDay', 'Calls agendadas por día', ''], ['showRate', 'Show-up', '%'], ['closeRate', 'Cierre', '%'], ['ticket', 'Ticket', 'USD']];
  return (
    <section className="glass panel">
      <div className="panel__head">
        <h2 className="panel__title">Tus métricas · simulador</h2>
        <button className="btn btn--ghost btn--sm" onClick={() => setV(real)}>Volver a mis números</button>
      </div>
      <div className="table-wrap">
        <table className="table table--num">
          <thead><tr><th></th><th>Tus números</th><th>Probá con</th></tr></thead>
          <tbody>
            {fields.map(([k, label, unit]) => (
              <tr key={k}>
                <td>{label}</td>
                <td>{fmtNum(real[k])}{unit === '%' ? '%' : ''}</td>
                <td>
                  <input className="field field--num" type="number" min="0" step={k === 'ticket' ? 100 : 1} value={Math.round(v[k] * 10) / 10}
                    onChange={(e) => setV((s) => ({ ...s, [k]: Number(e.target.value) }))} />
                </td>
              </tr>
            ))}
            <tr><td>Agendas en 30 días</td><td>{fmtNum(base.booked)}</td><td>{fmtNum(r.booked)}</td></tr>
            <tr><td>Ventas en 30 días</td><td>{fmtNum(base.sales)}</td><td>{fmtNum(r.sales)}</td></tr>
            <tr><td><strong>Comisión en 30 días</strong></td><td>{usd(base.commission)}</td><td><strong>{usd(r.commission)}</strong></td></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

const fmtNum = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-AR');

/** Números reales de los últimos 30 días para el simulador. */
export function realNumbers(opts: { dials: number; answered: number; contacted: number; booked: number; calls: SalesCall[] }): SimInput {
  const marked = opts.calls.filter((c) => c.attendance);
  const shows = marked.filter((c) => c.attendance === 'se_presento');
  const sales = opts.calls.filter((c) => c.result === 'cerro');
  const pct = (n: number, d: number, dflt: number) => (d ? (n / d) * 100 : dflt);
  return {
    dialsPerDay: opts.dials / 30,
    answerRate: pct(opts.answered, opts.contacted, 30),
    bookRate: pct(opts.booked, opts.answered, 30),
    showRate: pct(shows.length, marked.length, 70),
    closeRate: pct(sales.length, shows.length, 25),
    ticket: sales.length ? sales.reduce((s, c) => s + Number(c.amount_total ?? 0), 0) / sales.length : 3000,
  };
}

/** Semana de calls (lunes a domingo). */
export function CallCalendar({ calls, reps, onOpen, showCloser }: { calls: CallRow[]; reps: SalesRep[]; onOpen: (c: CallRow) => void; showCloser?: boolean }) {
  const [week, setWeek] = useState(0);
  const days = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const monday = new Date(d.getTime() - ((d.getDay() + 6) % 7) * 86400000 + week * 7 * 86400000);
    return Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86400000));
  }, [week]);
  const key = (d: Date) => localDay(d.toISOString());
  const todayKey = localDay(new Date().toISOString());
  const byDay = (d: Date) =>
    calls.filter((c) => c.status !== 'cancelada' && localDay(c.scheduled_at) === key(d)).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const fmtDay = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const fmtTime = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });

  return (
    <section>
      <div className="toolbar">
        <div className="filters" style={{ marginBottom: 0 }}>
          <button className="btn btn--ghost btn--sm" onClick={() => setWeek((w) => w - 1)}>← Semana anterior</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setWeek(0)}>Hoy</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setWeek((w) => w + 1)}>Semana siguiente →</button>
        </div>
      </div>
      <div className="cal">
        {days.map((d) => (
          <div key={d.toISOString()} className={`cal__day glass${key(d) === todayKey ? ' is-today' : ''}`}>
            <div className="cal__head">{fmtDay.format(d)}</div>
            {byDay(d).map((c) => {
              const st = CALL_STATE[callState(c)];
              return (
                <button key={c.id} type="button" className={`cal__call cal__call--${st.tone}`} onClick={() => onOpen(c)}>
                  <span className="cal__time">{fmtTime.format(new Date(c.scheduled_at))}</span>
                  <span className="cal__who">{c.lead_launch.lead.full_name || c.lead_launch.lead.email}</span>
                  <small>{st.label}{showCloser ? ` · ${reps.find((r) => r.id === c.closer_id)?.name ?? '—'}` : ''}</small>
                </button>
              );
            })}
            {byDay(d).length === 0 && <span className="muted cal__empty">—</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function CallPill({ call }: { call: SalesCall }) {
  const st = CALL_STATE[callState(call)];
  return <Pill tone={st.tone}>{st.label}</Pill>;
}
