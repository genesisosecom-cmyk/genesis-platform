import { useState } from 'react';
import { useParams } from 'react-router-dom';
import LeadDetail from '../../crm/LeadDetail';
import { reassignSdr, type LeadRow } from '../../crm/api';
import type { SalesRep } from '../../lib/types';

export default function AdminLeadPage() {
  const { leadLaunchId = '' } = useParams();
  return (
    <LeadDetail
      leadLaunchId={leadLaunchId}
      mode="admin"
      back={{ to: '/admin/leads', label: 'Leads' }}
      extra={({ row, reps, reload }) => <ReassignSdr row={row} reps={reps} onDone={reload} />}
    />
  );
}

function ReassignSdr({ row, reps, onDone }: { row: LeadRow; reps: SalesRep[]; onDone: () => void }) {
  const [sdrId, setSdrId] = useState(row.lead.sdr_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = reps.filter((r) => r.sdr_status && (r.sdr_status !== 'baja' || r.id === row.lead.sdr_id));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await reassignSdr(row.lead_id, sdrId || null);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className="panel__title">SDR asignado</h2>
      <div className="filters">
        <select className="field field--select" value={sdrId} onChange={(e) => setSdrId(e.target.value)}>
          <option value="">Sin asignar</option>
          {options.map((r) => (
            <option key={r.id} value={r.id} disabled={r.sdr_status === 'baja'}>
              {r.name}{r.sdr_status !== 'activo' ? ` (${r.sdr_status})` : ''}
            </option>
          ))}
        </select>
        <button className="btn btn--primary" disabled={busy || sdrId === (row.lead.sdr_id ?? '')} onClick={save}>
          {busy ? 'Guardando…' : 'Reasignar'}
        </button>
      </div>
      <p className="muted">El SDR es de la persona (vale para todos los lanzamientos). El cambio queda en el historial.</p>
      {error && <p className="state--error">{error}</p>}
    </>
  );
}
