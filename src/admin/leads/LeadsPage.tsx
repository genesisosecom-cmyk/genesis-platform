import { useState, type ReactNode } from 'react';
import { useAsync } from '../../lib/useAsync';
import { fmtDateTime } from '../../lib/format';
import { Kpi, Pill, State } from '../ui';
import { fetchLaunches, fetchLeadRows, fetchSalesReps, fetchVisits, updateRepWhatsapp, type LeadRow } from './api';
import type { LandingVisit, SalesRep } from '../../lib/types';

type Filter = 'all' | 'califica' | 'grupo' | 'aplico';

const FILTERS: Record<Filter, { label: string; test: (r: LeadRow) => boolean }> = {
  all: { label: 'Todos', test: () => true },
  califica: { label: 'Califican', test: (r) => r.califica === true },
  grupo: { label: 'Tocaron el grupo', test: (r) => r.toco_grupo },
  aplico: { label: 'Aplicaron', test: (r) => Boolean(r.applied_at) },
};

const MAX_ROWS = 300;

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');

export default function LeadsPage() {
  const launches = useAsync(fetchLaunches, []);
  const [picked, setPicked] = useState<string | null>(null);
  const launchId = picked ?? launches.data?.find((l) => l.is_current)?.id ?? launches.data?.[0]?.id ?? null;

  return (
    <State loading={launches.loading} error={launches.error} empty={!launchId}>
      {launchId && (
        <LaunchLeads
          key={launchId}
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
  );
}

function LaunchLeads({ launchId, picker }: { launchId: string; picker: ReactNode }) {
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([fetchLeadRows(launchId), fetchVisits(launchId), fetchSalesReps()]),
    [launchId],
  );
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const [rows = [], visits = [], reps = []] = data ?? [];
  const optins = rows.filter((r) => r.optin_at);
  const totalVisits = visits.reduce((s, v) => s + v.visits, 0);
  const applied = rows.filter((r) => r.applied_at);
  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      FILTERS[filter].test(r) &&
      (!q || `${r.lead.full_name} ${r.lead.email ?? ''} ${r.lead.phone ?? ''} ${r.source ?? ''}`.toLowerCase().includes(q)),
  );

  return (
    <>
      <div className="toolbar">
        {picker}
        <div className="toolbar__right">
          <input className="field field--search" type="search" placeholder="Buscar lead…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn btn--ghost" onClick={reload}>Actualizar</button>
        </div>
      </div>

      <State loading={loading} error={error}>
        <div className="kpis kpis--4">
          <Kpi label="Visitas" value={totalVisits.toLocaleString('es-AR')} />
          <Kpi label="Optins" value={optins.length.toLocaleString('es-AR')} hint={`${pct(optins.length, totalVisits)} de conversión`} />
          <Kpi
            label="Califican"
            value={optins.filter((r) => r.califica).length.toLocaleString('es-AR')}
            hint={`${pct(optins.filter((r) => r.califica).length, optins.length)} de los optins`}
            tone="ok"
          />
          <Kpi
            label="Tocaron el grupo"
            value={rows.filter((r) => r.toco_grupo).length.toLocaleString('es-AR')}
            hint={`${pct(rows.filter((r) => r.toco_grupo).length, optins.length)} de los optins`}
          />
          <Kpi
            label="Aplicaron"
            value={applied.length.toLocaleString('es-AR')}
            hint={`${applied.filter((r) => r.route === 'rechazado').length} a próximo ciclo · ${rows.filter((r) => r.lead.possible_duplicate).length} posibles duplicados`}
          />
        </div>

        <div className="two-col">
          <Funnel title="Por versión de la landing" rows={optins} visits={visits} keyOf={(x) => x.variant || '—'} />
          <Funnel title="Por fuente" rows={optins} visits={visits} keyOf={(x) => x.source || '—'} />
        </div>

        <h2 className="section-title">Leads</h2>
        <div className="toolbar">
          <div className="chips">
            {(Object.keys(FILTERS) as Filter[]).map((f) => (
              <button key={f} className={`chip${filter === f ? ' is-active' : ''}`} onClick={() => setFilter(f)}>
                {FILTERS[f].label} <span className="muted">{rows.filter(FILTERS[f].test).length}</span>
              </button>
            ))}
          </div>
        </div>
        <State loading={false} error={null} empty={!filtered.length}>
          <div className="glass table-wrap">
            <table className="table">
              <thead>
                <tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Inversión</th><th>Califica</th><th>Versión</th><th>Fuente</th><th>Optin</th><th>Grupo</th><th>Aplicó</th></tr>
              </thead>
              <tbody>
                {filtered.slice(0, MAX_ROWS).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-main">
                        {r.lead.full_name || '—'}
                        {r.lead.possible_duplicate && <Pill tone="warn">Posible duplicado</Pill>}
                      </div>
                      {r.optin_count > 1 && <div className="cell-sub">Se registró {r.optin_count} veces</div>}
                    </td>
                    <td>{r.lead.email ?? '—'}</td>
                    <td>{r.lead.phone ? `+${r.lead.phone}` : '—'}</td>
                    <td>{r.inversion_meta ?? '—'}</td>
                    <td>{r.califica === null ? '—' : r.califica ? <Pill tone="ok">Sí</Pill> : <Pill tone="muted">No</Pill>}</td>
                    <td>{r.variant ?? '—'}</td>
                    <td>{r.source ?? '—'}</td>
                    <td>{fmtDateTime(r.optin_at)}</td>
                    <td>{r.toco_grupo ? <Pill tone="accent">{fmtDateTime(r.toco_grupo_at)}</Pill> : '—'}</td>
                    <td>
                      {r.route === 'aplicado' && <Pill tone="ok">Aplicó{r.lead.sdr ? ` · ${r.lead.sdr}` : ''}</Pill>}
                      {r.route === 'rechazado' && <Pill tone="muted">Próximo ciclo</Pill>}
                      {!r.route && '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > MAX_ROWS && (
            <p className="muted" style={{ marginTop: 12 }}>Mostrando {MAX_ROWS} de {filtered.length}. Usá el buscador para encontrar un lead.</p>
          )}
        </State>

        <h2 className="section-title">WhatsApp de los SDR</h2>
        <SdrLinks reps={reps.filter((r) => r.kind === 'sdr')} onSaved={reload} />
      </State>
    </>
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
  const groups = new Map<string, { visits: number; optins: number }>();
  const bump = (k: string, field: 'visits' | 'optins', n: number) => {
    const g = groups.get(k) ?? { visits: 0, optins: 0 };
    g[field] += n;
    groups.set(k, g);
  };
  visits.forEach((v) => bump(keyOf(v), 'visits', v.visits));
  rows.forEach((r) => bump(keyOf(r), 'optins', 1));
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
              <tr><th></th><th>Visitas</th><th>Optins</th><th>Conversión</th></tr>
            </thead>
            <tbody>
              {sorted.map(([k, g]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{g.visits.toLocaleString('es-AR')}</td>
                  <td>{g.optins.toLocaleString('es-AR')}</td>
                  <td>{pct(g.optins, g.visits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Link de WhatsApp al que /aplicacion manda a cada lead según su SDR. */
function SdrLinks({ reps, onSaved }: { reps: SalesRep[]; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (name: string) => {
    setSaving(name);
    setError(null);
    try {
      await updateRepWhatsapp(name, (draft[name] ?? '').trim());
      setDraft(({ [name]: _, ...rest }) => rest);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="glass panel">
      {reps.map((r) => {
        const value = draft[r.name] ?? r.whatsapp_url;
        const dirty = r.name in draft && draft[r.name].trim() !== r.whatsapp_url;
        return (
          <div key={r.name} className="toolbar" style={{ marginBottom: 0 }}>
            <strong style={{ minWidth: 60 }}>{r.name}</strong>
            <div className="toolbar__right" style={{ flex: 1 }}>
              <input
                className="field"
                type="url"
                value={value}
                placeholder="https://wa.link/…"
                onChange={(e) => setDraft((d) => ({ ...d, [r.name]: e.target.value }))}
              />
              <button className="btn btn--primary" disabled={!dirty || saving === r.name} onClick={() => save(r.name)}>
                {saving === r.name ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        );
      })}
      {error && <p className="state--error">Error: {error}</p>}
    </div>
  );
}
