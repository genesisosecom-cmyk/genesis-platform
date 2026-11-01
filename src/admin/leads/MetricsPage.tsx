import type { ReactNode } from 'react';
import { useAsync } from '../../lib/useAsync';
import { fmtMoney } from '../../lib/format';
import { Kpi, State } from '../ui';
import { fetchCalls, fetchLeadRows, fetchSalesReps, fetchVisits, type CallRow, type LeadRow } from '../../crm/api';
import type { LandingVisit, SalesRep } from '../../lib/types';
import { useLaunchPicker } from './LeadsPage';

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
const num = (n: number) => n.toLocaleString('es-AR');
const money = (n: number) => fmtMoney(n, 'USD');

export default function MetricsPage() {
  const { launches, launchId, picker } = useLaunchPicker();
  return (
    <State loading={launches.loading} error={launches.error} empty={!launchId}>
      {launchId && <LaunchMetrics key={launchId} launchId={launchId} picker={picker} />}
    </State>
  );
}

function LaunchMetrics({ launchId, picker }: { launchId: string; picker: ReactNode }) {
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([fetchLeadRows(launchId), fetchVisits(launchId), fetchCalls({ launchId }), fetchSalesReps()]),
    [launchId],
  );
  const [rows = [], visits = [], calls = [], reps = []] = data ?? [];
  const optins = rows.filter((r) => r.optin_at);
  const live = calls.filter((c) => c.status !== 'cancelada');
  const sales = live.filter((c) => c.result === 'cerro');
  const totalVisits = visits.reduce((s, v) => s + v.visits, 0);

  return (
    <>
      <div className="toolbar">
        {picker}
        <div className="toolbar__right">
          <button className="btn btn--ghost" onClick={reload}>Actualizar</button>
        </div>
      </div>
      <State loading={loading} error={error}>
        <div className="kpis kpis--4">
          <Kpi label="Visitas" value={num(totalVisits)} />
          <Kpi label="Optins" value={num(optins.length)} hint={`${pct(optins.length, totalVisits)} de las visitas`} />
          <Kpi label="Calificados" value={pct(optins.filter((r) => r.califica).length, optins.length)} hint={`${optins.filter((r) => r.califica).length} de ${optins.length} optins`} tone="ok" />
          <Kpi label="Aplicaciones" value={num(rows.filter((r) => r.route === 'aplicado').length)} hint={`${rows.filter((r) => r.route === 'rechazado').length} a próximo ciclo`} />
          <Kpi label="Agendas" value={num(new Set(live.map((c) => c.lead_launch_id)).size)} hint={`${live.filter((c) => c.status === 'realizada').length} llamadas realizadas`} />
          <Kpi label="Ventas" value={num(sales.length)} hint={`${pct(sales.length, live.filter((c) => c.status === 'realizada').length)} de cierre`} tone="ok" />
          <Kpi label="Vendido" value={money(sum(sales, 'amount_total'))} />
          <Kpi label="Cash collected" value={money(sum(sales, 'amount_collected'))} tone="ok" />
        </div>

        <div className="two-col">
          <Funnel title="Por versión de la landing" rows={optins} visits={visits} keyOf={(x) => x.variant || '—'} />
          <Funnel title="Por fuente" rows={optins} visits={visits} keyOf={(x) => x.source || '—'} />
        </div>

        <h2 className="section-title">Por SDR</h2>
        <BySdr rows={rows} calls={live} reps={reps} />

        <h2 className="section-title">Por closer</h2>
        <ByCloser calls={live} reps={reps} />

        <p className="muted" style={{ marginTop: 16 }}>
          Las visitas no se dividen por SDR: pasan antes de que el lead tenga uno. Las ventas se atribuyen al SDR actual del lead. Montos en USD (no convierte otras monedas).
        </p>
      </State>
    </>
  );
}

const sum = (calls: CallRow[], k: 'amount_total' | 'amount_collected') => calls.reduce((s, c) => s + Number(c[k] ?? 0), 0);

function BySdr({ rows, calls, reps }: { rows: LeadRow[]; calls: CallRow[]; reps: SalesRep[] }) {
  const keys = [...new Set(rows.map((r) => r.lead.sdr_id ?? ''))];
  const name = (id: string) => (id ? reps.find((r) => r.id === id)?.name ?? '—' : 'Sin asignar');
  const lines = keys
    .map((id) => {
      const mine = rows.filter((r) => (r.lead.sdr_id ?? '') === id);
      const ids = new Set(mine.map((r) => r.id));
      const myCalls = calls.filter((c) => ids.has(c.lead_launch_id));
      const mySales = myCalls.filter((c) => c.result === 'cerro');
      const scheduled = new Set(myCalls.map((c) => c.lead_launch_id)).size;
      return {
        id,
        cells: [
          name(id),
          num(mine.length),
          num(mine.filter((r) => r.califica).length),
          num(mine.filter((r) => r.route === 'aplicado').length),
          num(scheduled),
          num(mySales.length),
          pct(mySales.length, scheduled),
          money(sum(mySales, 'amount_total')),
          money(sum(mySales, 'amount_collected')),
        ],
        sort: mine.length,
      };
    })
    .sort((a, b) => Number(a.id === '') - Number(b.id === '') || b.sort - a.sort);
  return <NumTable head={['SDR', 'Leads', 'Calificados', 'Aplicaron', 'Agendados', 'Ventas', '% cierre', 'Vendido', 'Cobrado']} lines={lines} />;
}

function ByCloser({ calls, reps }: { calls: CallRow[]; reps: SalesRep[] }) {
  const keys = [...new Set(calls.map((c) => c.closer_id ?? ''))];
  const lines = keys
    .map((id) => {
      const mine = calls.filter((c) => (c.closer_id ?? '') === id);
      const done = mine.filter((c) => c.status === 'realizada');
      const sales = mine.filter((c) => c.result === 'cerro');
      return {
        id,
        cells: [
          reps.find((r) => r.id === id)?.name ?? '—',
          num(mine.length),
          num(done.length),
          num(mine.filter((c) => c.status === 'agendada' && new Date(c.scheduled_at) < new Date()).length),
          num(sales.length),
          pct(sales.length, done.length),
          money(sum(sales, 'amount_total')),
          money(sum(sales, 'amount_collected')),
        ],
        sort: sales.length * 1000 + mine.length,
      };
    })
    .sort((a, b) => b.sort - a.sort);
  return <NumTable head={['Closer', 'Llamadas', 'Realizadas', 'Sin resultado', 'Ventas', '% cierre', 'Vendido', 'Cobrado']} lines={lines} />;
}

function NumTable({ head, lines }: { head: string[]; lines: { id: string; cells: ReactNode[] }[] }) {
  if (!lines.length) return <p className="muted">Todavía no hay datos.</p>;
  return (
    <div className="glass table-wrap">
      <table className="table table--num">
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id || 'none'}>{l.cells.map((c, i) => <td key={i}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Visitas → optins agrupados por versión o por fuente. */
function Funnel({
  title,
  rows,
  visits,
  keyOf,
}: {
  title: string;
  rows: LeadRow[];
  visits: LandingVisit[];
  keyOf: (x: { variant: string | null; source: string | null }) => string;
}) {
  const groups = new Map<string, { visits: number; optins: number; qualified: number }>();
  const get = (k: string) => groups.get(k) ?? (groups.set(k, { visits: 0, optins: 0, qualified: 0 }), groups.get(k)!);
  visits.forEach((v) => (get(keyOf(v)).visits += v.visits));
  rows.forEach((r) => {
    const g = get(keyOf(r));
    g.optins += 1;
    if (r.califica) g.qualified += 1;
  });
  const sorted = [...groups.entries()].sort((a, b) => b[1].optins - a[1].optins || b[1].visits - a[1].visits);

  return (
    <section className="glass panel">
      <div className="panel__head">
        <h2 className="panel__title">{title}</h2>
      </div>
      {sorted.length === 0 ? (
        <p className="muted">Todavía no hay datos.</p>
      ) : (
        <div className="table-wrap">
          <table className="table table--num">
            <thead>
              <tr><th></th><th>Visitas</th><th>Optins</th><th>Conversión</th><th>Calificados</th></tr>
            </thead>
            <tbody>
              {sorted.map(([k, g]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{num(g.visits)}</td>
                  <td>{num(g.optins)}</td>
                  <td>{pct(g.optins, g.visits)}</td>
                  <td>{pct(g.qualified, g.optins)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
