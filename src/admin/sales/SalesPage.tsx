import { useMemo, useState, type ReactNode } from 'react';
import { useAsync } from '../../lib/useAsync';
import { fmtDate, fmtMoney, todayISO } from '../../lib/format';
import { Kpi, Modal, Pill, State } from '../ui';
import type { Payment, SalesRep } from '../../lib/types';
import {
  fetchCalls,
  fetchCommissions,
  fetchLeadRows,
  fetchSalePayments,
  fetchSalesReps,
  type CallRow,
  type LeadRow,
} from '../../crm/api';
import { followupDue, inFollowup, inRange, isBooked, isFinalized, isNoCuenta, periodRange, type Period } from '../../crm/model';
import CallCard from '../../crm/CallCard';
import { CallCalendar } from '../../crm/widgets';
import { useLaunchPicker } from '../leads/LeadsPage';

type Tab = 'resumen' | 'leads' | 'cobros' | 'equipo' | 'calendario';
const usd = (n: number) => fmtMoney(n, 'USD');

async function load(launchId: string) {
  const [rows, calls, reps] = await Promise.all([fetchLeadRows(launchId), fetchCalls({}), fetchSalesReps()]);
  const payments = await fetchSalePayments(calls.filter((c) => c.result === 'cerro').map((c) => c.id));
  return { rows, calls, reps, payments };
}

/** Vista del director de ventas. */
export default function SalesPage() {
  const { launches, launchId, picker } = useLaunchPicker();
  return (
    <State loading={launches.loading} error={launches.error} empty={!launchId}>
      {launchId && <Director key={launchId} launchId={launchId} picker={picker} />}
    </State>
  );
}

function Director({ launchId, picker }: { launchId: string; picker: ReactNode }) {
  const { data, loading, error, reload } = useAsync(() => load(launchId), [launchId]);
  const [tab, setTab] = useState<Tab>('resumen');
  const [period, setPeriod] = useState<Period>('mes');
  const [open, setOpen] = useState<string | null>(null);
  const current = data?.calls.find((c) => c.id === open) ?? null;

  return (
    <>
      <div className="toolbar">
        <div className="filters" style={{ marginBottom: 0 }}>
          {picker}
          {(tab === 'resumen' || tab === 'equipo') && (
            <div className="seg">
              {(['hoy', 'semana', 'mes', 'todo'] as Period[]).map((p) => (
                <button key={p} type="button" className={`seg__opt${period === p ? ' is-on' : ''}`} onClick={() => setPeriod(p)}>
                  {p === 'hoy' ? 'Hoy' : p === 'semana' ? 'Esta semana' : p === 'mes' ? 'Este mes' : 'Todo'}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="toolbar__right"><button className="btn btn--ghost" onClick={reload}>Actualizar</button></div>
      </div>
      <div className="chips" style={{ marginBottom: 20 }}>
        {([['resumen', 'Resumen'], ['leads', 'Dónde está cada lead'], ['cobros', 'Cobros'], ['equipo', 'Equipo'], ['calendario', 'Calendario']] as [Tab, string][]).map(([t, l]) => (
          <button key={t} className={`chip${tab === t ? ' is-active' : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>
      <State loading={loading} error={error}>
        {data && tab === 'resumen' && <Summary calls={data.calls} payments={data.payments} period={period} />}
        {data && tab === 'leads' && <WhereIsEachLead rows={data.rows} calls={data.calls} />}
        {data && tab === 'cobros' && <Collections calls={data.calls} payments={data.payments} reps={data.reps} onOpen={setOpen} />}
        {data && tab === 'equipo' && <Team rows={data.rows} calls={data.calls} reps={data.reps} period={period} />}
        {data && tab === 'calendario' && <CallCalendar calls={data.calls} reps={data.reps} showCloser onOpen={(c) => setOpen(c.id)} />}
      </State>
      {current && data && (
        <Modal title="Call" onClose={() => setOpen(null)} wide>
          <CallCard call={current} reps={data.reps} payments={data.payments.filter((p) => p.sales_call_id === current.id)} canEdit onChanged={reload} />
        </Modal>
      )}
    </>
  );
}

function metrics(calls: CallRow[], payments: Payment[], range: { from: string | null; to: string | null }) {
  const sales = calls.filter((c) => c.result === 'cerro' && inRange(c.closed_at, range));
  const scheduled = calls.filter((c) => c.status !== 'cancelada' && inRange(c.scheduled_at, range));
  const marked = scheduled.filter((c) => c.attendance);
  const shows = marked.filter((c) => c.attendance === 'se_presento');
  const billed = sales.reduce((s, c) => s + Number(c.amount_total ?? 0), 0);
  const cash = payments.filter((p) => p.paid_at && inRange(p.paid_at, range)).reduce((s, p) => s + Number(p.amount), 0);
  return {
    billed,
    cash,
    sales: sales.length,
    showUp: marked.length ? shows.length / marked.length : null,
    close: shows.length ? scheduled.filter((c) => c.result === 'cerro').length / shows.length : null,
    aov: sales.length ? billed / sales.length : null,
  };
}

function delta(cur: number | null, prev: number | null, pct = false) {
  if (cur === null || prev === null) return undefined;
  if (prev === 0) return cur > 0 ? 'sin datos del período anterior' : undefined;
  const d = pct ? (cur - prev) * 100 : ((cur - prev) / prev) * 100;
  return `${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(0)}${pct ? ' pts' : '%'} vs. período anterior`;
}

function Summary({ calls, payments, period }: { calls: CallRow[]; payments: Payment[]; period: Period }) {
  const cur = metrics(calls, payments, periodRange(period));
  const prev = period === 'todo' ? null : metrics(calls, payments, periodRange(period, 1));
  const due = payments.filter((p) => !p.paid_at);
  const overdue = due.filter((p) => p.due_date && p.due_date < todayISO());
  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
  return (
    <div className="kpis kpis--4">
      <Kpi label="Facturación" value={usd(cur.billed)} hint={prev ? delta(cur.billed, prev.billed) : undefined} />
      <Kpi label="Cash cobrado" value={usd(cur.cash)} tone="ok" hint={prev ? delta(cur.cash, prev.cash) : undefined} />
      <Kpi label="Cuotas por cobrar" value={usd(due.reduce((s, p) => s + Number(p.amount), 0))} hint={`${due.length} cuotas`} />
      <Kpi label="Cuotas vencidas" value={usd(overdue.reduce((s, p) => s + Number(p.amount), 0))} tone={overdue.length ? 'warn' : undefined} hint={`${overdue.length} cuotas`} />
      <Kpi label="Ventas" value={cur.sales} hint={prev ? delta(cur.sales, prev.sales) : undefined} />
      <Kpi label="Show-up" value={pct(cur.showUp)} hint={prev ? delta(cur.showUp, prev.showUp, true) : undefined} />
      <Kpi label="Cierre" value={pct(cur.close)} hint={prev ? delta(cur.close, prev.close, true) : undefined} />
      <Kpi label="Ticket promedio (AOV)" value={cur.aov === null ? '—' : usd(cur.aov)} hint={prev ? delta(cur.aov, prev.aov) : undefined} />
    </div>
  );
}

function WhereIsEachLead({ rows, calls }: { rows: LeadRow[]; calls: CallRow[] }) {
  const callOf = useMemo(() => {
    const m = new Map<string, CallRow>();
    calls.filter((c) => c.status !== 'cancelada').forEach((c) => {
      const prev = m.get(c.lead_launch_id);
      if (!prev || prev.scheduled_at < c.scheduled_at) m.set(c.lead_launch_id, c);
    });
    return m;
  }, [calls]);
  const stage = (r: LeadRow): string => {
    if (isNoCuenta(r)) return 'No cuentan';
    const c = callOf.get(r.id);
    if (c?.result === 'cerro') return 'Venta';
    if (c?.result === 'no_cerro') return 'No cerró';
    if (c?.result === 'seguimiento') return 'Follow-up del closer';
    if (c && c.attendance === 'se_presento') return 'Se presentó · falta resultado';
    if (isBooked(r)) return 'Agendado';
    if (isFinalized(r)) return 'Finalizado';
    if (!r.lead.sdr_id) return r.califica ? 'Por asignar (calificados)' : 'Sin calificar';
    if (inFollowup(r)) return followupDue(r) ? 'Seguimiento · toca ahora' : 'Seguimiento';
    if (r.contact_attempts > 0 || r.answered !== null) return 'En contacto';
    return 'Asignado · sin tocar';
  };
  const ORDER = ['Por asignar (calificados)', 'Sin calificar', 'Asignado · sin tocar', 'En contacto', 'Seguimiento · toca ahora', 'Seguimiento', 'Agendado', 'Se presentó · falta resultado', 'Follow-up del closer', 'Venta', 'No cerró', 'Finalizado', 'No cuentan'];
  const counts = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [stage(r)]: (acc[stage(r)] ?? 0) + 1 }), {});
  const max = Math.max(1, ...Object.values(counts));
  return (
    <section className="glass panel">
      <div className="funnel">
        {ORDER.filter((k) => counts[k]).map((k) => (
          <div key={k} className="funnel__row">
            <span className="funnel__label">{k}</span>
            <span className="funnel__bar"><span style={{ width: `${(counts[k] / max) * 100}%` }} /></span>
            <span className="funnel__n">{counts[k]} <span className="muted">· {Math.round((counts[k] / rows.length) * 100)}%</span></span>
          </div>
        ))}
        {!rows.length && <p className="muted">Todavía no hay leads en este lanzamiento.</p>}
      </div>
    </section>
  );
}

function Collections({ calls, payments, reps, onOpen }: { calls: CallRow[]; payments: Payment[]; reps: SalesRep[]; onOpen: (id: string) => void }) {
  const name = (id: string | null) => reps.find((r) => r.id === id)?.name ?? '—';
  const sales = calls.filter((c) => c.result === 'cerro').sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''));
  const today = todayISO();
  if (!sales.length) return <div className="state muted">Todavía no hay ventas.</div>;
  return (
    <div className="glass table-wrap">
      <table className="table">
        <thead><tr><th>Cliente</th><th>Closer · SDR</th><th>Fecha</th><th>Venta</th><th>Cobrado</th><th>Por cobrar</th><th>Próxima cuota</th></tr></thead>
        <tbody>
          {sales.map((c) => {
            const mine = payments.filter((p) => p.sales_call_id === c.id);
            const paid = mine.filter((p) => p.paid_at).reduce((s, p) => s + Number(p.amount), 0);
            const due = mine.filter((p) => !p.paid_at).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
            const next = due[0];
            return (
              <tr key={c.id} className="table__row" onClick={() => onOpen(c.id)}>
                <td><div className="cell-main">{c.lead_launch.lead.full_name || c.lead_launch.lead.email}</div><div className="cell-sub">{c.program ?? ''}</div></td>
                <td>{name(c.closer_id)} · {name(c.sdr_id)}</td>
                <td>{fmtDate(c.closed_at)}</td>
                <td>{fmtMoney(Number(c.amount_total), c.currency)}</td>
                <td>{fmtMoney(paid, c.currency)}</td>
                <td>{fmtMoney(due.reduce((s, p) => s + Number(p.amount), 0), c.currency)}</td>
                <td>{next ? <Pill tone={next.due_date && next.due_date < today ? 'warn' : 'muted'}>{fmtDate(next.due_date)} · {fmtMoney(Number(next.amount), c.currency)}</Pill> : <Pill tone="ok">Saldada</Pill>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Team({ rows, calls, reps, period }: { rows: LeadRow[]; calls: CallRow[]; reps: SalesRep[]; period: Period }) {
  const range = periodRange(period);
  const commissions = useAsync(() => fetchCommissions(range.from, range.to), [period]);
  const com = (id: string, role: 'sdr' | 'closer') => commissions.data?.find((c) => c.rep_id === id && c.role === role);
  const inPeriod = calls.filter((c) => c.status !== 'cancelada' && inRange(c.scheduled_at, range));
  const sdrs = reps.filter((r) => r.sdr_status);
  const closers = reps.filter((r) => r.closer_status);
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');

  return (
    <State loading={commissions.loading} error={commissions.error}>
      <h2 className="section-title">SDRs</h2>
      <div className="glass table-wrap">
        <table className="table table--num">
          <thead><tr><th>SDR</th><th>Leads</th><th>Dials</th><th>Contestaron</th><th>Agendas</th><th>Show-up</th><th>Ventas</th><th>Comisión</th><th>Pendiente</th></tr></thead>
          <tbody>
            {sdrs.map((r) => {
              const mine = rows.filter((x) => x.lead.sdr_id === r.id);
              const myCalls = inPeriod.filter((c) => c.sdr_id === r.id);
              const marked = myCalls.filter((c) => c.attendance);
              return (
                <tr key={r.id}>
                  <td>{r.name}{r.sdr_status !== 'activo' && <span className="muted"> ({r.sdr_status})</span>}</td>
                  <td>{mine.length}</td>
                  <td>{mine.reduce((s, x) => s + x.contact_attempts, 0)}</td>
                  <td>{mine.filter((x) => x.answered).length}</td>
                  <td>{myCalls.length}</td>
                  <td>{pct(marked.filter((c) => c.attendance === 'se_presento').length, marked.length)}</td>
                  <td>{myCalls.filter((c) => c.result === 'cerro').length}</td>
                  <td>{usd(Number(com(r.id, 'sdr')?.earned ?? 0))}</td>
                  <td>{usd(Number(com(r.id, 'sdr')?.pending ?? 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2 className="section-title">Closers</h2>
      <div className="glass table-wrap">
        <table className="table table--num">
          <thead><tr><th>Closer</th><th>Calls</th><th>Show-up</th><th>Cierre</th><th>Ventas</th><th>Vendido</th><th>Cash</th><th>Comisión</th><th>Pendiente</th></tr></thead>
          <tbody>
            {closers.map((r) => {
              const mine = inPeriod.filter((c) => c.closer_id === r.id);
              const marked = mine.filter((c) => c.attendance);
              const shows = marked.filter((c) => c.attendance === 'se_presento');
              const sales = mine.filter((c) => c.result === 'cerro');
              return (
                <tr key={r.id}>
                  <td>{r.name}{r.closer_status !== 'activo' && <span className="muted"> ({r.closer_status})</span>}</td>
                  <td>{mine.length}</td>
                  <td>{pct(shows.length, marked.length)}</td>
                  <td>{pct(sales.length, shows.length)}</td>
                  <td>{sales.length}</td>
                  <td>{usd(sales.reduce((s, c) => s + Number(c.amount_total ?? 0), 0))}</td>
                  <td>{usd(Number(com(r.id, 'closer')?.cash ?? 0))}</td>
                  <td>{usd(Number(com(r.id, 'closer')?.earned ?? 0))}</td>
                  <td>{usd(Number(com(r.id, 'closer')?.pending ?? 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>Comisión sobre el cash cobrado en el período: el SDR por las ventas que agendó y el closer por las que cerró. "Pendiente" es la comisión de las cuotas que faltan cobrar.</p>
    </State>
  );
}
