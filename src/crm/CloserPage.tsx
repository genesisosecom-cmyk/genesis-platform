import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../lib/useAsync';
import { fmtDateTime, fmtMoney } from '../lib/format';
import { Field, Kpi, Modal, State } from '../admin/ui';
import {
  fetchCalls,
  fetchCommissions,
  fetchLaunches,
  fetchLaunchProgress,
  fetchLeadRows,
  fetchSalePayments,
  fetchSalesReps,
  fetchSettings,
  localToIso,
  scheduleCall,
  type CallRow,
} from './api';
import { closerReview, periodRange } from './model';
import CallCard from './CallCard';
import { NewLeadModal, ResourcesModal } from './modals';
import { CallCalendar, CallPill, CommissionCards, LaunchGoal, realNumbers, ScopeToggle, Simulator } from './widgets';
import { WhatsAppButton } from './components';
import TeamMetricsPanel from './TeamMetricsPanel';
import { WithTip } from '../components/InfoTip';
import { CALL_TIPS } from './tips';
import { useLaunchPicker } from '../admin/leads/LeadsPage';

type Tab = 'calendario' | 'seguimientos' | 'revisar' | 'resumen' | 'metricas';

async function load() {
  const launches = await fetchLaunches();
  const launch = launches.find((l) => l.is_current) ?? launches[0] ?? null;
  const [calls, reps, settings, progress] = await Promise.all([
    fetchCalls({}),
    fetchSalesReps(),
    fetchSettings().catch(() => null),
    launch ? fetchLaunchProgress(launch.id) : Promise.resolve(null),
  ]);
  const payments = await fetchSalePayments(calls.filter((c) => c.result === 'cerro').map((c) => c.id));
  return { launch, calls, reps, settings, progress, payments };
}

export default function CloserPage() {
  const { rep, isCloser, isAdmin } = useAuth();
  const { callId } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(load, []);
  const me = isCloser ? rep!.id : null;
  const [tab, setTab] = useState<Tab>('calendario');
  const [scope, setScope] = useState<'mine' | 'team'>(me ? 'mine' : 'team');
  const [open, setOpen] = useState<string | null>(callId ?? null);
  const [manual, setManual] = useState(false);
  const [creating, setCreating] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);

  useEffect(() => setOpen(callId ?? null), [callId]);

  const calls = useMemo(() => (data?.calls ?? []).filter((c) => scope === 'team' || c.closer_id === me), [data, scope, me]);
  const dueBySale = useMemo(
    () => (data?.payments ?? []).filter((p) => !p.paid_at && p.sales_call_id).reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.sales_call_id!]: (acc[p.sales_call_id!] ?? 0) + Number(p.amount) }), {}),
    [data],
  );
  const review = closerReview(calls.filter((c) => c.status !== 'cancelada'), dueBySale);
  const followups = calls.filter((c) => c.result === 'seguimiento').sort((a, b) => (a.closer_followup_at ?? '').localeCompare(b.closer_followup_at ?? ''));
  const current = data?.calls.find((c) => c.id === open) ?? null;
  const close = () => {
    setOpen(null);
    if (callId) navigate('/closer', { replace: true });
  };

  return (
    <div className="fade-in">
      <header className="page__header">
        <span className="eyebrow">Panel closer{rep && isCloser ? ` · ${rep.name}` : ''}</span>
        <h1 className="page__title">Calls</h1>
      </header>
      {!isCloser && !isAdmin ? (
        <p className="muted">Tu usuario no está cargado como closer.</p>
      ) : (
        <State loading={loading} error={error}>
          {data && (
            <>
              {data.launch && <LaunchGoal launch={data.launch} progress={data.progress} />}
              <nav className="tabs">
                {([
                  ['calendario', 'Calendario'],
                  ['seguimientos', `Follow-ups · ${followups.length}`],
                  ['revisar', `Para revisar · ${review.length}`],
                  ['resumen', 'Resumen'],
                  ['metricas', 'Métricas'],
                ] as [Tab, string][]).map(([t, label]) => (
                  <button key={t} type="button" className={`tabs__link tabs__btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{label}</button>
                ))}
              </nav>
              <div className="toolbar">
                <div className="filters" style={{ marginBottom: 0 }}>{me && <ScopeToggle value={scope} onChange={setScope} />}</div>
                <div className="toolbar__right">
                  <button className="btn btn--ghost" onClick={() => setResourcesOpen(true)}>Recursos</button>
                  {me && <button className="btn btn--ghost" onClick={() => setCreating(true)}>+ Nuevo lead</button>}
                  {me && <button className="btn btn--primary" onClick={() => setManual(true)}>+ Agendar a mano</button>}
                  <button className="btn btn--ghost" onClick={reload}>Actualizar</button>
                </div>
              </div>

              {tab === 'calendario' && <CallCalendar calls={calls} reps={data.reps} showCloser={scope === 'team'} onOpen={(c) => setOpen(c.id)} />}

              {tab === 'seguimientos' && (
                <CallList calls={followups} empty="No tenés follow-ups." onOpen={setOpen} extra={(c) => (c.closer_followup_at ? <span className={Date.parse(c.closer_followup_at) < Date.now() ? 'text-warn' : 'muted'}>Follow-up {fmtDateTime(c.closer_followup_at)}</span> : null)} />
              )}

              {tab === 'revisar' && (
                review.length ? (
                  <ul className="mini-list glass panel">
                    {review.map((r) => (
                      <li key={r.id}><button type="button" className="mini-list__item link--btn" onClick={() => setOpen(r.id)}>{r.text}<span className="link">Cargar</span></button></li>
                    ))}
                  </ul>
                ) : <div className="state muted">Nada para revisar.</div>
              )}

              {tab === 'metricas' && <CloserMetrics />}

              {tab === 'resumen' && <CloserSummary calls={calls} me={me} pct={Number(data.settings?.closer_commission_pct ?? 7)} />}
            </>
          )}
        </State>
      )}

      {current && data && (
        <Modal title="Call" onClose={close} wide>
          <CallCard
            call={current}
            reps={data.reps}
            payments={data.payments.filter((p) => p.sales_call_id === current.id)}
            canEdit={isAdmin || current.closer_id === me}
            onChanged={reload}
          />
        </Modal>
      )}
      {manual && data && me && (
        <ManualCallModal closerId={me} onClose={() => setManual(false)} onSaved={() => { setManual(false); reload(); }} launchId={data.launch?.id ?? null} />
      )}
      {creating && data && me && (
        <NewLeadModal
          closers={data.reps.filter((r) => r.id === me)}
          canAssign={false}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); reload(); }}
        />
      )}
      {resourcesOpen && <ResourcesModal role="closer" onClose={() => setResourcesOpen(false)} />}
    </div>
  );
}

/** Tablero de métricas del closer (el admin ve a todos los closers). */
function CloserMetrics() {
  const { launches, launchId, picker } = useLaunchPicker();
  return (
    <State loading={launches.loading} error={launches.error} empty={!launchId}>
      {launchId && <TeamMetricsPanel launchId={launchId} picker={(launches.data?.length ?? 0) > 1 ? picker : null} only="closer" />}
    </State>
  );
}

function CallList({ calls, empty, onOpen, extra }: { calls: CallRow[]; empty: string; onOpen: (id: string) => void; extra?: (c: CallRow) => ReactNode }) {
  if (!calls.length) return <div className="state muted">{empty}</div>;
  return (
    <div className="glass table-wrap">
      <table className="table">
        <thead><tr><th><WithTip tip={CALL_TIPS.lead}>Lead</WithTip></th><th><WithTip tip={CALL_TIPS.whatsapp}>WhatsApp</WithTip></th><th><WithTip tip={CALL_TIPS.when}>Call</WithTip></th><th><WithTip tip={CALL_TIPS.state}>Estado</WithTip></th><th>{extra && <WithTip tip={CALL_TIPS.followup}>Follow-up</WithTip>}</th></tr></thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.id} className="table__row" onClick={() => onOpen(c.id)}>
              <td><div className="cell-main">{c.lead_launch.lead.full_name || '—'}</div><div className="cell-sub">{c.lead_launch.inversion_meta ?? ''}</div></td>
              <td><WhatsAppButton phone={c.lead_launch.lead.phone} small /></td>
              <td>{fmtDateTime(c.scheduled_at)}</td>
              <td><CallPill call={c} /></td>
              <td>{extra?.(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CloserSummary({ calls, me, pct }: { calls: CallRow[]; me: string | null; pct: number }) {
  const [period, setPeriod] = useState<'mes' | 'todo'>('mes');
  const range = periodRange(period);
  const commissions = useAsync(() => fetchCommissions(range.from, range.to), [period]);
  const live = calls.filter((c) => c.status !== 'cancelada');
  const marked = live.filter((c) => c.attendance);
  const shows = marked.filter((c) => c.attendance === 'se_presento');
  const sales = live.filter((c) => c.result === 'cerro');
  const billed = sales.reduce((s, c) => s + Number(c.amount_total ?? 0), 0);
  const real = realNumbers({ dials: live.length, answered: 1, contacted: 1, booked: 1, calls: live });
  real.answerRate = 100;
  real.bookRate = 100;

  return (
    <>
      <div className="filters">
        <div className="seg">
          <button type="button" className={`seg__opt${period === 'mes' ? ' is-on' : ''}`} onClick={() => setPeriod('mes')}>Este mes</button>
          <button type="button" className={`seg__opt${period === 'todo' ? ' is-on' : ''}`} onClick={() => setPeriod('todo')}>Todo</button>
        </div>
      </div>
      <State loading={commissions.loading} error={commissions.error}>
        <CommissionCards rows={(commissions.data ?? []).filter((c) => c.role === 'closer' && (!me || c.rep_id === me))} pct={pct} />
      </State>
      <h2 className="section-title">Resultados de tus calls</h2>
      <div className="kpis kpis--4">
        <Kpi label="Calls" value={live.length} hint={`${marked.length} con asistencia marcada`} />
        <Kpi label="Show-up" value={marked.length ? `${Math.round((shows.length / marked.length) * 100)}%` : '—'} />
        <Kpi label="Cierre" value={shows.length ? `${Math.round((sales.length / shows.length) * 100)}%` : '—'} hint={`${sales.length} ventas`} tone="ok" />
        <Kpi label="Ticket promedio" value={sales.length ? fmtMoney(billed / sales.length, 'USD') : '—'} hint={`${fmtMoney(billed, 'USD')} vendidos`} />
      </div>
      <Simulator mode="closer" real={real} pct={pct} />
    </>
  );
}

/** "+ Agendar a mano": el closer agenda una call para sí mismo con un lead existente. */
function ManualCallModal({ closerId, launchId, onClose, onSaved }: { closerId: string; launchId: string | null; onClose: () => void; onSaved: () => void }) {
  const rows = useAsync(() => (launchId ? fetchLeadRows(launchId) : Promise.resolve([])), [launchId]);
  const [query, setQuery] = useState('');
  const [leadId, setLeadId] = useState('');
  const [at, setAt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const hits = (rows.data ?? []).filter((r) => q && `${r.lead.full_name} ${r.lead.email ?? ''} ${r.lead.phone ?? ''}`.toLowerCase().includes(q)).slice(0, 8);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await scheduleCall(leadId, closerId, localToIso(at)!, note);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Agendar a mano" onClose={onClose}>
      <div className="aform">
        <Field label="Buscar lead" full><input className="field" value={query} onChange={(e) => { setQuery(e.target.value); setLeadId(''); }} placeholder="Nombre, mail o teléfono" autoFocus /></Field>
        {hits.length > 0 && !leadId && (
          <ul className="mini-list afield--full">
            {hits.map((r) => (
              <li key={r.id}><button type="button" className="mini-list__item link--btn" onClick={() => { setLeadId(r.id); setQuery(r.lead.full_name || r.lead.email || ''); }}>{r.lead.full_name || '—'} <span className="muted">{r.lead.email ?? r.lead.phone}</span></button></li>
            ))}
          </ul>
        )}
        <Field label="Fecha y hora"><input className="field" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        <Field label="Nota"><input className="field" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <p className="muted afield--full">Si el lead no existe, cargalo con "+ Nuevo lead" eligiéndote como closer y la fecha de la call.</p>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={busy || !leadId || !at} onClick={save}>Agendar</button>
        </div>
      </div>
    </Modal>
  );
}
