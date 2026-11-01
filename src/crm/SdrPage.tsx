import { useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../lib/useAsync';
import { Kpi, State } from '../admin/ui';
import { byPriority, fetchLaunches, fetchLeadRows, type LeadRow } from './api';
import LeadTable, { searchText } from './LeadTable';
import { isClosed } from './components';

type Filter = 'abiertos' | 'hoy' | 'aplicaron' | 'califican' | 'sin_contactar' | 'agendados' | 'cerrados' | 'todos';

const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};

const FILTERS: Record<Filter, { label: string; test: (r: LeadRow) => boolean }> = {
  abiertos: { label: 'Abiertos', test: (r) => !isClosed(r) },
  hoy: { label: 'Tareas para hoy', test: (r) => Boolean(r.next_action_at && r.next_action_at <= endOfToday()) && !isClosed(r) },
  aplicaron: { label: 'Aplicaron', test: (r) => r.route === 'aplicado' },
  califican: { label: 'Califican', test: (r) => r.califica === true },
  sin_contactar: { label: 'Sin contactar', test: (r) => !r.post_class_status || r.post_class_status === 'Nuevo lead' },
  agendados: { label: 'Agendados', test: (r) => r.post_class_status === 'Agendado' },
  cerrados: { label: 'Cerrados', test: isClosed },
  todos: { label: 'Todos', test: () => true },
};

export default function SdrPage() {
  const { rep, isSdr } = useAuth();
  const launches = useAsync(fetchLaunches, []);
  const [picked, setPicked] = useState<string | null>(null);
  const launchId = picked ?? launches.data?.find((l) => l.is_current)?.id ?? launches.data?.[0]?.id ?? null;

  return (
    <div className="fade-in">
      <header className="page__header">
        <span className="eyebrow">Panel SDR{rep && isSdr ? ` · ${rep.name}` : ''}</span>
        <h1 className="page__title">Mis leads</h1>
      </header>
      {!rep || !isSdr ? (
        <p className="muted">Tu usuario no está cargado como SDR. Para ver los leads de todo el equipo, usá Admin → Leads.</p>
      ) : (
        <State loading={launches.loading} error={launches.error} empty={!launchId}>
          {launchId && (
            <MyLeads
              key={launchId}
              sdrId={rep.id}
              launchId={launchId}
              picker={
                <select className="field field--select" value={launchId} onChange={(e) => setPicked(e.target.value)}>
                  {launches.data!.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}{l.is_current ? ' (actual)' : ''}</option>
                  ))}
                </select>
              }
            />
          )}
        </State>
      )}
    </div>
  );
}

function MyLeads({ sdrId, launchId, picker }: { sdrId: string; launchId: string; picker: ReactNode }) {
  const { data, loading, error, reload } = useAsync(() => fetchLeadRows(launchId, sdrId), [launchId, sdrId]);
  const [filter, setFilter] = useState<Filter>('abiertos');
  const [query, setQuery] = useState('');
  const rows = [...(data ?? [])].sort(byPriority);
  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => FILTERS[filter].test(r) && (!q || searchText(r).includes(q)));

  return (
    <>
      <div className="kpis kpis--4">
        <Kpi label="Asignados" value={rows.length} />
        <Kpi label="Aplicaron" value={rows.filter(FILTERS.aplicaron.test).length} tone="ok" />
        <Kpi label="Tareas para hoy" value={rows.filter(FILTERS.hoy.test).length} tone={rows.some(FILTERS.hoy.test) ? 'warn' : undefined} />
        <Kpi label="Agendados" value={rows.filter(FILTERS.agendados.test).length} />
      </div>
      <div className="toolbar">
        {picker}
        <div className="toolbar__right">
          <input className="field field--search" type="search" placeholder="Buscar lead…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn btn--ghost" onClick={reload}>Actualizar</button>
        </div>
      </div>
      <div className="chips" style={{ marginBottom: 20 }}>
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <button key={f} className={`chip${filter === f ? ' is-active' : ''}`} onClick={() => setFilter(f)}>
            {FILTERS[f].label} <span className="muted">{rows.filter(FILTERS[f].test).length}</span>
          </button>
        ))}
      </div>
      <State loading={loading} error={error} empty={!filtered.length}>
        <LeadTable rows={filtered} linkTo={(r) => `/sdr/${r.id}`} />
      </State>
    </>
  );
}
