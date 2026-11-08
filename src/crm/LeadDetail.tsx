import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../lib/useAsync';
import { State } from '../admin/ui';
import { ArrowLeft } from '../components/Icons';
import { useAuth } from '../auth/AuthContext';
import { fetchAgents, fetchCallsOf, fetchLaunches, fetchLeadEvents, fetchLeadRow, fetchSalesReps, type LeadRow } from './api';
import type { SalesRep } from '../lib/types';
import { ApplicationAnswers, CallsList, LeadSummary, Timeline } from './components';
import LeadCard from './LeadCard';
import { useLiveReload } from '../lib/realtime';

async function load(id: string) {
  const row = await fetchLeadRow(id);
  const [events, calls, reps, agents, launches] = await Promise.all([fetchLeadEvents(row.lead_id), fetchCallsOf(id), fetchSalesReps(), fetchAgents(), fetchLaunches()]);
  return { row, events, calls, reps, agents, launch: launches.find((l) => l.id === row.launch_id) ?? null };
}

/** Ficha del lead en el admin: la tarjeta de trabajo, llamadas, datos, aplicación e historial. */
export default function LeadDetail({
  leadLaunchId,
  back,
  extra,
}: {
  leadLaunchId: string;
  back: { to: string; label: string };
  /** Controles extra (ej: reasignar SDR en el admin). */
  extra?: (data: { row: LeadRow; reps: SalesRep[]; reload: () => void }) => ReactNode;
}) {
  const { rep, isSdr, isAdmin } = useAuth();
  const { data, loading, error, reload } = useAsync(() => load(leadLaunchId), [leadLaunchId]);
  useLiveReload(
    [{ table: 'lead_launches', filter: `id=eq.${leadLaunchId}` }, { table: 'sales_calls', filter: `lead_launch_id=eq.${leadLaunchId}` }, ...(data ? [{ table: 'lead_events', filter: `lead_id=eq.${data.row.lead_id}` }, { table: 'leads', filter: `id=eq.${data.row.lead_id}` }] : [])],
    reload,
  );

  return (
    <>
      <Link to={back.to} className="back"><ArrowLeft width={16} height={16} /> {back.label}</Link>
      <State loading={loading} error={error}>
        {data && (() => {
          const { row, events, calls, reps, agents, launch } = data;
          return (
            <div className="two-col two-col--top">
              <div className="stack">
                <LeadCard
                  key={row.updated_at}
                  row={row}
                  defaultOpen
                  ctx={{ reps, agents, launchStartsAt: launch?.starts_at ?? null, me: isSdr ? rep!.id : null, isAdmin, refresh: reload }}
                />
                {extra && <section className="glass panel">{extra({ row, reps, reload })}</section>}
                <section className="glass panel">
                  <h2 className="panel__title">Llamadas</h2>
                  <CallsList calls={calls} reps={reps} linkCalls />
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
          );
        })()}
      </State>
    </>
  );
}
