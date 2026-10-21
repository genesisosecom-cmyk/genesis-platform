import { Link } from 'react-router-dom';
import { useAsync } from '../lib/useAsync';
import { fetchAllProgress, fetchClients, fetchForms, fetchPayments, fetchProfiles, fetchResponses, paymentStatus } from './api';
import { summarizeProgress } from '../progress/ProgressContext';
import { Kpi, Pill, State } from './ui';
import { fmtDate, fmtDateTime, fmtMoney, todayISO } from '../lib/format';

const loadOverview = () =>
  Promise.all([fetchProfiles(), fetchAllProgress(), fetchResponses(), fetchForms(), fetchClients(), fetchPayments()]);

export default function OverviewPage() {
  const { data, loading, error } = useAsync(loadOverview, []);

  return (
    <State loading={loading} error={error}>
      {data && <Overview data={data} />}
    </State>
  );
}

function Overview({ data }: { data: Awaited<ReturnType<typeof loadOverview>> }) {
  const [profiles, progress, responses, forms, clients, payments] = data;
  const members = profiles.filter((p) => p.role === 'member');
  const avg = members.length
    ? Math.round(members.reduce((s, m) => s + summarizeProgress(progress.filter((r) => r.user_id === m.id)).overallPercent, 0) / members.length)
    : 0;
  const weekAgo = Date.now() - 7 * 86400000;
  const activeWeek = members.filter((m) => m.last_seen_at && new Date(m.last_seen_at).getTime() > weekAgo).length;
  const unread = responses.filter((r) => !r.reviewed);
  const today = todayISO();
  const overdue = payments.filter((p) => paymentStatus(p, today) === 'vencido');
  const month = today.slice(0, 7);
  const collectedMonth = payments.filter((p) => p.paid_at?.startsWith(month)).reduce((s, p) => s + Number(p.amount), 0);
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const upcoming = payments.filter((p) => !p.paid_at && p.due_date && p.due_date >= today && p.due_date <= in7);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.full_name ?? '—';
  const formTitle = (id: string) => forms.find((f) => f.id === id)?.title ?? '—';

  return (
    <>
      <div className="kpis kpis--3">
        <Kpi label="Usuarios del campus" value={members.length} hint={`${activeWeek} activos esta semana`} />
        <Kpi label="Avance promedio" value={`${avg}%`} />
        <Kpi label="Respuestas sin leer" value={unread.length} tone={unread.length ? 'warn' : undefined} hint={`${responses.length} en total`} />
        <Kpi label="Clientes activos" value={clients.filter((c) => c.status === 'activo').length} hint={`${clients.length} en total`} />
        <Kpi label="Cobrado este mes" value={fmtMoney(collectedMonth)} tone="ok" />
        <Kpi label="Cuotas vencidas" value={overdue.length} tone={overdue.length ? 'warn' : undefined} hint={overdue.length ? fmtMoney(overdue.reduce((s, p) => s + Number(p.amount), 0)) : 'Todo al día'} />
      </div>

      <div className="two-col">
        <section className="glass panel">
          <div className="panel__head">
            <h2 className="panel__title">Últimas respuestas sin leer</h2>
            <Link to="/admin/respuestas" className="link">Ver todas</Link>
          </div>
          {unread.length === 0 && <p className="muted">Nada pendiente.</p>}
          <ul className="mini-list">
            {unread.slice(0, 6).map((r) => (
              <li key={r.id}>
                <Link to={`/admin/respuestas/${r.id}`} className="mini-list__item">
                  <span>
                    <strong>{r.respondent_name}</strong>
                    <span className="muted"> · {formTitle(r.form_id)}</span>
                  </span>
                  <span className="muted">{r.call_date ? `Llamada ${fmtDate(r.call_date)}` : fmtDateTime(r.submitted_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass panel">
          <div className="panel__head">
            <h2 className="panel__title">Cobros: vencidos y próximos 7 días</h2>
            <Link to="/admin/clientes" className="link">Ver clientes</Link>
          </div>
          {overdue.length + upcoming.length === 0 && <p className="muted">Sin cobros pendientes cercanos.</p>}
          <ul className="mini-list">
            {[...overdue, ...upcoming].slice(0, 8).map((p) => (
              <li key={p.id}>
                <Link to={`/admin/clientes/${p.client_id}`} className="mini-list__item">
                  <span>
                    <strong>{clientName(p.client_id)}</strong>
                    <span className="muted"> · {fmtMoney(Number(p.amount), p.currency)}</span>
                  </span>
                  <span>
                    {paymentStatus(p, today) === 'vencido' ? <Pill tone="warn">Vencida {fmtDate(p.due_date)}</Pill> : <Pill tone="muted">{fmtDate(p.due_date)}</Pill>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
