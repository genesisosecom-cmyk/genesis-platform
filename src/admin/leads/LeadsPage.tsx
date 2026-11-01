import { useState, type ReactNode } from 'react';
import { useAsync } from '../../lib/useAsync';
import { Kpi, State } from '../ui';
import { distributeLeads, fetchLaunches, fetchLeadRows, fetchSalesReps, POST_CLASS_STATUSES, type LeadRow } from '../../crm/api';
import LeadTable, { searchText } from '../../crm/LeadTable';

export function useLaunchPicker() {
  const launches = useAsync(fetchLaunches, []);
  const [picked, setPicked] = useState<string | null>(null);
  const launchId = picked ?? launches.data?.find((l) => l.is_current)?.id ?? launches.data?.[0]?.id ?? null;
  const picker = launchId && (
    <select className="field field--select" value={launchId} onChange={(e) => setPicked(e.target.value)}>
      {launches.data!.map((l) => (
        <option key={l.id} value={l.id}>{l.name}{l.is_current ? ' (actual)' : ''}</option>
      ))}
    </select>
  );
  return { launches, launchId, picker };
}

export default function LeadsPage() {
  const { launches, launchId, picker } = useLaunchPicker();
  return (
    <State loading={launches.loading} error={launches.error} empty={!launchId}>
      {launchId && <LaunchLeads key={launchId} launchId={launchId} picker={picker} />}
    </State>
  );
}

type Chip = 'all' | 'califica' | 'aplico' | 'grupo';
const CHIPS: Record<Chip, { label: string; test: (r: LeadRow) => boolean }> = {
  all: { label: 'Todos', test: () => true },
  califica: { label: 'Califican', test: (r) => r.califica === true },
  aplico: { label: 'Aplicaron', test: (r) => r.route === 'aplicado' },
  grupo: { label: 'Tocaron el grupo', test: (r) => r.toco_grupo },
};

function LaunchLeads({ launchId, picker }: { launchId: string; picker: ReactNode }) {
  const { data, loading, error, reload } = useAsync(() => Promise.all([fetchLeadRows(launchId), fetchSalesReps()]), [launchId]);
  const [chip, setChip] = useState<Chip>('all');
  const [sdr, setSdr] = useState('all');
  const [closer, setCloser] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [rows = [], reps = []] = data ?? [];
  const sdrs = reps.filter((r) => r.sdr_status);
  const closers = reps.filter((r) => r.closer_status);
  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      CHIPS[chip].test(r) &&
      (sdr === 'all' || (sdr === 'none' ? !r.lead.sdr_id : r.lead.sdr_id === sdr)) &&
      (closer === 'all' || (closer === 'none' ? !r.closer_id : r.closer_id === closer)) &&
      (status === 'all' || (status === 'none' ? !r.post_class_status : r.post_class_status === status)) &&
      (!q || searchText(r).includes(q)),
  );
  // Sin SDR y en condiciones de tenerlo: calificados o que aplicaron (no rechazados).
  const unassigned = rows.filter((r) => !r.lead.sdr_id && (r.califica || r.route === 'aplicado'));
  const activeSdrs = sdrs.filter((r) => r.sdr_status === 'activo').length;

  const distribute = async () => {
    if (!window.confirm(`¿Repartir ${unassigned.length} lead(s) sin SDR entre los ${activeSdrs} SDR activos?`)) return;
    setBusy(true);
    setNotice(null);
    try {
      const n = await distributeLeads(launchId);
      setNotice(`Se repartieron ${n} lead(s).`);
      reload();
    } catch (e) {
      setNotice(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

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
          <Kpi label="Leads" value={rows.length.toLocaleString('es-AR')} hint={`${rows.filter((r) => r.optin_at).length} optins`} />
          <Kpi label="Califican" value={rows.filter(CHIPS.califica.test).length} tone="ok" />
          <Kpi label="Aplicaron" value={rows.filter(CHIPS.aplico.test).length} />
          <Kpi
            label="Sin SDR"
            value={unassigned.length}
            tone={unassigned.length ? 'warn' : undefined}
            hint={
              unassigned.length && activeSdrs ? (
                <button className="link link--btn" disabled={busy} onClick={distribute}>Repartir entre {activeSdrs} SDR activos</button>
              ) : !activeSdrs ? 'No hay SDR activos' : 'Todos asignados'
            }
          />
        </div>
        {notice && <p className="muted" style={{ marginBottom: 16 }}>{notice}</p>}

        <div className="toolbar">
          <div className="chips">
            {(Object.keys(CHIPS) as Chip[]).map((c) => (
              <button key={c} className={`chip${chip === c ? ' is-active' : ''}`} onClick={() => setChip(c)}>
                {CHIPS[c].label} <span className="muted">{rows.filter(CHIPS[c].test).length}</span>
              </button>
            ))}
          </div>
          <div className="filters">
            <select className="field field--select" value={sdr} onChange={(e) => setSdr(e.target.value)} aria-label="SDR">
              <option value="all">Todos los SDR</option>
              <option value="none">Sin SDR</option>
              {sdrs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select className="field field--select" value={closer} onChange={(e) => setCloser(e.target.value)} aria-label="Closer">
              <option value="all">Todos los closers</option>
              <option value="none">Sin closer</option>
              {closers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select className="field field--select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado">
              <option value="all">Todos los estados</option>
              <option value="none">Sin estado</option>
              {POST_CLASS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <State loading={false} error={null} empty={!filtered.length}>
          <LeadTable rows={filtered} reps={reps} linkTo={(r) => `/admin/leads/${r.id}`} />
        </State>
      </State>
    </>
  );
}
