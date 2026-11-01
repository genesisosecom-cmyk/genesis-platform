import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../lib/useAsync';
import { fmtDateTime } from '../lib/format';
import { Kpi, State } from '../admin/ui';
import { fetchCalls, type CallRow } from './api';
import { CallStatePill, WhatsAppButton } from './components';

type Tab = 'hoy' | 'proximas' | 'sin_resultado' | 'realizadas';

const dayBounds = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400000);
  return { start: start.toISOString(), end: end.toISOString() };
};

function tabs(): Record<Tab, { label: string; test: (c: CallRow) => boolean }> {
  const { start, end } = dayBounds();
  const now = new Date().toISOString();
  return {
    hoy: { label: 'Hoy', test: (c) => c.status !== 'cancelada' && c.scheduled_at >= start && c.scheduled_at < end },
    proximas: { label: 'Próximas', test: (c) => c.status === 'agendada' && c.scheduled_at >= end },
    sin_resultado: { label: 'Pasadas sin resultado', test: (c) => c.status === 'agendada' && c.scheduled_at < now },
    realizadas: { label: 'Realizadas', test: (c) => c.status === 'realizada' },
  };
}

export default function CloserPage() {
  const { rep, isCloser } = useAuth();
  return (
    <div className="fade-in">
      <header className="page__header">
        <span className="eyebrow">Panel closer{rep && isCloser ? ` · ${rep.name}` : ''}</span>
        <h1 className="page__title">Mis llamadas</h1>
      </header>
      {!rep || !isCloser ? (
        <p className="muted">Tu usuario no está cargado como closer. Para ver las llamadas de todo el equipo, usá Admin → Leads.</p>
      ) : (
        <Agenda closerId={rep.id} />
      )}
    </div>
  );
}

function Agenda({ closerId }: { closerId: string }) {
  const { data, loading, error, reload } = useAsync(() => fetchCalls({ closerId }), [closerId]);
  const [tab, setTab] = useState<Tab>('hoy');
  const navigate = useNavigate();
  const defs = tabs();
  const calls = data ?? [];
  const list = calls.filter(defs[tab].test);
  if (tab === 'realizadas' || tab === 'sin_resultado') list.reverse();
  const sales = calls.filter((c) => c.result === 'cerro');

  return (
    <>
      <div className="kpis kpis--4">
        <Kpi label="Hoy" value={calls.filter(defs.hoy.test).length} />
        <Kpi label="Sin resultado" value={calls.filter(defs.sin_resultado.test).length} tone={calls.some(defs.sin_resultado.test) ? 'warn' : undefined} />
        <Kpi label="Realizadas" value={calls.filter(defs.realizadas.test).length} />
        <Kpi label="Ventas" value={sales.length} tone="ok" />
      </div>
      <div className="toolbar">
        <div className="chips">
          {(Object.keys(defs) as Tab[]).map((t) => (
            <button key={t} className={`chip${tab === t ? ' is-active' : ''}`} onClick={() => setTab(t)}>
              {defs[t].label} <span className="muted">{calls.filter(defs[t].test).length}</span>
            </button>
          ))}
        </div>
        <div className="toolbar__right">
          <button className="btn btn--ghost" onClick={reload}>Actualizar</button>
        </div>
      </div>
      <State loading={loading} error={error} empty={!list.length}>
        <div className="glass table-wrap">
          <table className="table">
            <thead>
              <tr><th>Llamada</th><th>Lead</th><th>WhatsApp</th><th>Inversión</th><th>Agendó</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const r = c.lead_launch;
                return (
                  <tr key={c.id} className="table__row" onClick={() => navigate(`/closer/${c.id}`)}>
                    <td>{fmtDateTime(c.scheduled_at)}</td>
                    <td>
                      <div className="cell-main">{r.lead.full_name || '—'}</div>
                      <div className="cell-sub">{r.lead.email ?? ''}</div>
                    </td>
                    <td><WhatsAppButton phone={r.lead.phone} small /></td>
                    <td>{(r.application as { inversion?: string } | null)?.inversion ?? r.inversion_meta ?? '—'}</td>
                    <td>{c.scheduled_by_name ?? '—'}</td>
                    <td><CallStatePill call={c} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </State>
    </>
  );
}
