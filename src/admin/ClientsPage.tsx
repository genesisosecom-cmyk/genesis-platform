import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync } from '../lib/useAsync';
import { clientBalance, fetchClients, fetchPayments } from './api';
import { Kpi, Pill, State } from './ui';
import ProgressBar from '../components/ProgressBar';
import ClientFormModal, { STATUS_LABELS } from './ClientForm';
import { fmtDate, fmtMoney } from '../lib/format';
import type { ClientStatus } from '../lib/types';

const load = () => Promise.all([fetchClients(), fetchPayments()]);

export default function ClientsPage() {
  const { data, loading, error, reload } = useAsync(load, []);
  const navigate = useNavigate();
  const [status, setStatus] = useState<ClientStatus | 'all' | 'overdue'>('all');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const [clients = [], payments = []] = data ?? [];
  const rows = clients.map((c) => ({ client: c, b: clientBalance(c, payments) }));
  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    ({ client: c, b }) =>
      (status === 'all' || (status === 'overdue' ? b.overdueCount > 0 : c.status === status)) &&
      (!q || `${c.full_name} ${c.email ?? ''} ${c.company ?? ''} ${c.program ?? ''}`.toLowerCase().includes(q)),
  );

  // Los totales se agrupan por moneda para no mezclar USD con ARS.
  const byCurrency = (pick: (r: (typeof rows)[number]) => number) =>
    Object.entries(
      rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.client.currency]: (acc[r.client.currency] ?? 0) + pick(r) }), {}),
    )
      .filter(([, n]) => n > 0)
      .map(([cur, n]) => fmtMoney(n, cur))
      .join(' · ') || fmtMoney(0);

  return (
    <>
      <div className="kpis kpis--4">
        <Kpi label="Clientes activos" value={clients.filter((c) => c.status === 'activo').length} />
        <Kpi label="Facturado (contratos)" value={byCurrency((r) => r.b.total)} />
        <Kpi label="Cobrado" value={byCurrency((r) => r.b.paid)} tone="ok" />
        <Kpi label="Vencido" value={byCurrency((r) => r.b.overdueAmount)} tone={rows.some((r) => r.b.overdueCount) ? 'warn' : undefined} />
      </div>

      <div className="toolbar">
        <div className="chips">
          {(['all', 'overdue', 'activo', 'pausado', 'finalizado', 'baja'] as const).map((s) => (
            <button key={s} className={`chip${status === s ? ' is-active' : ''}`} onClick={() => setStatus(s)}>
              {s === 'all' ? 'Todos' : s === 'overdue' ? 'Con deuda' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="toolbar__right">
          <input className="field field--search" type="search" placeholder="Buscar cliente…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn btn--primary" onClick={() => setCreating(true)}>+ Nuevo cliente</button>
        </div>
      </div>

      <State loading={loading} error={error} empty={!filtered.length}>
        <div className="glass table-wrap">
          <table className="table">
            <thead>
              <tr><th>Cliente</th><th>Estado</th><th>Cuotas</th><th>Pagado</th><th>Próximo vencimiento</th><th>Deuda</th></tr>
            </thead>
            <tbody>
              {filtered.map(({ client: c, b }) => (
                <tr key={c.id} className="table__row" onClick={() => navigate(`/admin/clientes/${c.id}`)}>
                  <td>
                    <div className="cell-main">{c.full_name}</div>
                    <div className="cell-sub">{[c.program, c.email].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  <td><Pill tone={c.status === 'activo' ? 'ok' : 'muted'}>{STATUS_LABELS[c.status]}</Pill></td>
                  <td>{b.paidCount}/{c.installments_count}</td>
                  <td className="cell-progress">
                    <span>{fmtMoney(b.paid, c.currency)} <span className="muted">/ {fmtMoney(b.total, c.currency)}</span></span>
                    <ProgressBar percent={b.percent} />
                  </td>
                  <td>{b.next ? `${fmtDate(b.next.due_date)} · ${fmtMoney(Number(b.next.amount), b.next.currency)}` : '—'}</td>
                  <td>{b.overdueCount ? <Pill tone="warn">{b.overdueCount} vencida{b.overdueCount > 1 ? 's' : ''} · {fmtMoney(b.overdueAmount, c.currency)}</Pill> : <Pill tone="ok">Al día</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </State>

      {creating && <ClientFormModal client={null} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); reload(); navigate(`/admin/clientes/${id}`); }} />}
    </>
  );
}
