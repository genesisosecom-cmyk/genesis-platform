import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../lib/useAsync';
import { fmtDateTime } from '../lib/format';
import { State } from '../admin/ui';
import { ArrowLeft } from '../components/Icons';
import { fetchCallsOf, fetchLeadEvents, fetchLeadRow, fetchSalesReps, type LeadRow } from './api';
import type { SalesRep } from '../lib/types';
import { ApplicationAnswers, CallsList, LeadActions, LeadSummary, StatusPill, Timeline, WhatsAppButton, type Mode } from './components';

async function load(id: string) {
  const row = await fetchLeadRow(id);
  const [events, calls, reps] = await Promise.all([fetchLeadEvents(row.lead_id), fetchCallsOf(id), fetchSalesReps()]);
  return { row, events, calls, reps };
}

/** Ficha del lead: la usan el panel SDR, el admin y (sin acciones de SDR) el closer. */
export default function LeadDetail({
  leadLaunchId,
  mode,
  back,
  extra,
}: {
  leadLaunchId: string;
  mode: Mode;
  back: { to: string; label: string };
  /** Controles extra (ej: reasignar SDR en el admin). */
  extra?: (data: { row: LeadRow; reps: SalesRep[]; reload: () => void }) => ReactNode;
}) {
  const { data, loading, error, reload } = useAsync(() => load(leadLaunchId), [leadLaunchId]);

  return (
    <>
      <Link to={back.to} className="back"><ArrowLeft width={16} height={16} /> {back.label}</Link>
      <State loading={loading} error={error}>
        {data && (() => {
          const { row, events, calls, reps } = data;
          return (
            <>
              <div className="detail-head">
                <div>
                  <span className="eyebrow">{row.launch_id}</span>
                  <h2 className="page__title page__title--sm">{row.lead.full_name || row.lead.email || `+${row.lead.phone}`}</h2>
                  <div className="detail-meta">
                    <StatusPill status={row.post_class_status} />
                    {row.next_action_at && (
                      <span>Próxima tarea: {row.next_action ?? '—'} · {fmtDateTime(row.next_action_at)}</span>
                    )}
                  </div>
                </div>
                <WhatsAppButton phone={row.lead.phone} />
              </div>

              <div className="two-col two-col--top">
                <div className="stack">
                  <section className="glass panel">
                    <h2 className="panel__title">Acciones</h2>
                    <LeadActions row={row} reps={reps} mode={mode} onDone={reload} />
                  </section>
                  {extra && <section className="glass panel">{extra({ row, reps, reload })}</section>}
                  <section className="glass panel">
                    <h2 className="panel__title">Llamadas</h2>
                    <CallsList calls={calls} reps={reps} linkCalls={mode !== 'sdr'} />
                  </section>
                  <section className="glass panel">
                    <h2 className="panel__title">Historial</h2>
                    <Timeline events={events} />
                  </section>
                </div>
                <div className="stack">
                  <section className="glass panel">
                    <h2 className="panel__title">Datos</h2>
                    <LeadSummary row={row} reps={reps} />
                  </section>
                  <section className="glass panel">
                    <h2 className="panel__title">Aplicación</h2>
                    <ApplicationAnswers row={row} />
                  </section>
                </div>
              </div>
            </>
          );
        })()}
      </State>
    </>
  );
}
