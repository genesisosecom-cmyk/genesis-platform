import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { fetchProfiles } from '../api';
import { Field, Modal, Pill, State } from '../ui';
import { distributeLeads, fetchLaunches, fetchLeadCountBySdr, fetchSalesReps, fetchSettings, saveDefaultWhatsapp, saveRep, type RepInput } from '../../crm/api';
import type { Profile, RepStatus, SalesRep } from '../../lib/types';

const load = () => Promise.all([fetchSalesReps(), fetchProfiles(), fetchLeadCountBySdr(), fetchSettings(), fetchLaunches()]);

const STATUS_TONE: Record<RepStatus, 'ok' | 'warn' | 'muted'> = { activo: 'ok', pausado: 'warn', baja: 'muted' };
const STATUS_LABEL: Record<RepStatus, string> = { activo: 'Activo', pausado: 'Pausado', baja: 'Baja' };

function RoleCell({ status, extra }: { status: RepStatus | null; extra?: string }) {
  if (!status) return <span className="muted">—</span>;
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}{extra ? ` · ${extra}` : ''}</Pill>;
}

export default function TeamPage() {
  const { data, loading, error, reload } = useAsync(load, []);
  const [editing, setEditing] = useState<SalesRep | 'new' | null>(null);
  const [reps = [], profiles = [], counts = {}, settings, launches = []] = data ?? [];
  const email = (id: string | null) => profiles.find((p) => p.id === id)?.email;
  const currentLaunch = launches.find((l) => l.is_current)?.id ?? launches[0]?.id ?? null;
  const visible = [...reps].sort(
    (a, b) => Number(isGone(a)) - Number(isGone(b)) || a.name.localeCompare(b.name),
  );

  return (
    <State loading={loading} error={error}>
      {settings && <DefaultWhatsapp value={settings.default_whatsapp_url} onSaved={reload} />}

      <div className="toolbar">
        <p className="muted" style={{ margin: 0 }}>
          Cada persona necesita un usuario del campus (se crea en <Link className="link" to="/admin/usuarios">Usuarios</Link> como Miembro). SDRs y closers ven solo su panel.
        </p>
        <div className="toolbar__right">
          <button className="btn btn--primary" onClick={() => setEditing('new')}>+ Nueva persona</button>
        </div>
      </div>

      <State loading={false} error={null} empty={!reps.length}>
        <div className="glass table-wrap">
          <table className="table">
            <thead>
              <tr><th>Nombre</th><th>Usuario</th><th>WhatsApp</th><th>SDR</th><th>Closer</th><th>Leads asignados</th></tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="table__row" onClick={() => setEditing(r)}>
                  <td><div className="cell-main">{r.name}</div></td>
                  <td>{email(r.profile_id) ?? <Pill tone="warn">Sin usuario</Pill>}</td>
                  <td>{r.whatsapp_url ? <span className="cell-sub">{r.whatsapp_url}</span> : <Pill tone="warn">Sin link</Pill>}</td>
                  <td><RoleCell status={r.sdr_status} extra={r.sdr_status === 'activo' && r.sdr_weight !== 1 ? `peso ${r.sdr_weight}` : undefined} /></td>
                  <td><RoleCell status={r.closer_status} /></td>
                  <td>{counts[r.id] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </State>

      <p className="muted" style={{ marginTop: 16 }}>
        Reparto: los leads calificados se asignan al registrarse y el resto al aplicar, entre los SDR <strong>activos</strong> en round-robin según su peso (peso 2 recibe el doble). Pausado: no recibe leads nuevos pero sigue con los suyos. Baja: pierde el acceso al panel.
      </p>

      {editing && (
        <RepModal
          rep={editing === 'new' ? null : editing}
          profiles={profiles}
          reps={reps}
          leadCount={editing === 'new' ? 0 : counts[editing.id] ?? 0}
          currentLaunch={currentLaunch}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </State>
  );
}

const isGone = (r: SalesRep) => (r.sdr_status ?? 'baja') === 'baja' && (r.closer_status ?? 'baja') === 'baja';

function DefaultWhatsapp({ value, onSaved }: { value: string; onSaved: () => void }) {
  const [url, setUrl] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveDefaultWhatsapp(url.trim());
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="glass panel" style={{ marginBottom: 28 }} onSubmit={save}>
      <div className="panel__head">
        <h2 className="panel__title">WhatsApp por defecto</h2>
        {!value && <Pill tone="warn">Sin cargar</Pill>}
      </div>
      <p className="muted" style={{ margin: 0 }}>Adónde manda /aplicacion al lead cuando no tiene SDR (no hay ninguno activo) o su SDR no tiene link.</p>
      <div className="filters">
        <input className="field" style={{ flex: '1 1 280px' }} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://wa.link/…" />
        <button className="btn btn--primary" disabled={busy || url.trim() === value}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
      {error && <p className="state--error">{error}</p>}
    </form>
  );
}

function RepModal({
  rep,
  profiles,
  reps,
  leadCount,
  currentLaunch,
  onClose,
  onSaved,
}: {
  rep: SalesRep | null;
  profiles: Profile[];
  reps: SalesRep[];
  leadCount: number;
  currentLaunch: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState<RepInput>({
    name: rep?.name ?? '',
    whatsapp_url: rep?.whatsapp_url ?? '',
    profile_id: rep?.profile_id ?? null,
    sdr_status: rep ? rep.sdr_status : 'activo',
    closer_status: rep?.closer_status ?? null,
    sdr_weight: rep?.sdr_weight ?? 1,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linked = new Set(reps.filter((r) => r.id !== rep?.id && r.profile_id).map((r) => r.profile_id));
  const available = profiles.filter((p) => !linked.has(p.id));

  const pickProfile = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    setV((s) => ({ ...s, profile_id: id || null, name: s.name || p?.full_name || '' }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return setError('Falta el nombre.');
    if (!v.sdr_status && !v.closer_status) return setError('Elegí al menos un rol (SDR o closer).');
    setBusy(true);
    setError(null);
    try {
      await saveRep(rep?.id ?? null, { ...v, name: v.name.trim(), whatsapp_url: v.whatsapp_url.trim(), sdr_weight: Math.max(1, Math.round(v.sdr_weight || 1)) });
      // Si deja de trabajar como SDR, ofrecer repartir sus leads abiertos.
      const leaving = rep && (rep.sdr_status === 'activo' || rep.sdr_status === 'pausado') && (v.sdr_status === 'baja' || !v.sdr_status);
      if (leaving && leadCount > 0 && currentLaunch && window.confirm(`${rep.name} tiene ${leadCount} lead(s). ¿Repartir los que siguen abiertos entre los SDR activos?`)) {
        const n = await distributeLeads(currentLaunch, rep.id);
        window.alert(`Se repartieron ${n} lead(s).`);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const roleSelect = (key: 'sdr_status' | 'closer_status', none: string) => (
    <select
      className="field field--select"
      value={v[key] ?? ''}
      onChange={(e) => setV((s) => ({ ...s, [key]: (e.target.value || null) as RepStatus | null }))}
    >
      <option value="">{none}</option>
      <option value="activo">Activo</option>
      <option value="pausado">Pausado</option>
      <option value="baja">Baja</option>
    </select>
  );

  return (
    <Modal title={rep ? `Editar · ${rep.name}` : 'Nueva persona del equipo'} onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Usuario del campus">
          <select className="field field--select" value={v.profile_id ?? ''} onChange={(e) => pickProfile(e.target.value)}>
            <option value="">Sin usuario (no puede entrar al panel)</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name ? `${p.full_name} · ${p.email}` : p.email}{p.role === 'superadmin' ? ' (admin)' : ''}</option>
            ))}
          </select>
        </Field>
        <Field label="Nombre">
          <input className="field" value={v.name} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} />
        </Field>
        <Field label="Link de WhatsApp" full>
          <input className="field" type="url" value={v.whatsapp_url} onChange={(e) => setV((s) => ({ ...s, whatsapp_url: e.target.value }))} placeholder="https://wa.link/…" />
        </Field>
        <Field label="Rol SDR">{roleSelect('sdr_status', 'No es SDR')}</Field>
        <Field label="Peso en el reparto">
          <input className="field" type="number" min="1" max="100" disabled={!v.sdr_status} value={v.sdr_weight} onChange={(e) => setV((s) => ({ ...s, sdr_weight: Number(e.target.value) }))} />
        </Field>
        <Field label="Rol closer">{roleSelect('closer_status', 'No es closer')}</Field>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
