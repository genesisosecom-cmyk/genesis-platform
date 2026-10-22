import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../lib/useAsync';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { fetchAllProgress, fetchClients, fetchForms, fetchProfiles, fetchResponses } from './api';
import { summarizeProgress } from '../progress/ProgressContext';
import { Field, Modal, Pill, State } from './ui';
import ProgressBar from '../components/ProgressBar';
import { fmtDate, fmtDateTime, relativeTime } from '../lib/format';
import type { Profile } from '../lib/types';
import { adminUsers, type TempCredentials } from '../lib/adminUsers';
import { mmss, TEMP_PASSWORD_SECONDS, useCountdown } from '../lib/useCountdown';
import { useContent } from '../content/ContentContext';

const load = () => Promise.all([fetchProfiles(), fetchAllProgress(), fetchResponses(), fetchClients(), fetchForms()]);

export default function UsersPage() {
  const { modules } = useContent();
  const { data, loading, error, reload } = useAsync(load, []);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const [profiles = [], progress = [], responses = [], clients = [], forms = []] = data ?? [];
  const q = query.trim().toLowerCase();
  const rows = profiles
    .filter((p) => !q || `${p.full_name} ${p.email}`.toLowerCase().includes(q))
    .map((p) => ({
      profile: p,
      summary: summarizeProgress(progress.filter((r) => r.user_id === p.id), modules),
      responses: responses.filter((r) => r.user_id === p.id || r.respondent_email.toLowerCase() === p.email.toLowerCase()),
      client: clients.find((c) => c.profile_id === p.id || (c.email && c.email.toLowerCase() === p.email.toLowerCase())),
    }));
  const current = rows.find((r) => r.profile.id === selected);

  return (
    <>
      <div className="toolbar">
        <input className="field field--search" type="search" placeholder="Buscar usuario…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn btn--primary" onClick={() => setCreating(true)}>+ Nuevo usuario</button>
      </div>

      <State loading={loading} error={error} empty={!profiles.length}>
        <div className="glass table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Avance</th>
                <th>Lecciones</th>
                <th>Formularios</th>
                <th>Última actividad</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ profile: p, summary, responses: rs, client }) => (
                <tr key={p.id} className="table__row" onClick={() => setSelected(p.id)}>
                  <td>
                    <div className="cell-main">{p.full_name || '—'} {p.role === 'superadmin' && <Pill tone="accent">Admin</Pill>}</div>
                    <div className="cell-sub">{p.email}{client && ` · Cliente: ${client.program ?? client.full_name}`}</div>
                  </td>
                  <td className="cell-progress">
                    <span>{summary.overallPercent}%</span>
                    <ProgressBar percent={summary.overallPercent} />
                  </td>
                  <td>{summary.completedCount}/{summary.totalLessons}</td>
                  <td>{rs.length}</td>
                  <td>{relativeTime(p.last_seen_at)}</td>
                  <td><StatusPill profile={p} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </State>

      {creating && <CreateUserModal onClose={() => setCreating(false)} onCreated={reload} />}
      {current && (
        <UserDetail
          row={current}
          formTitle={(id) => forms.find((f) => f.id === id)?.title ?? '—'}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      )}
    </>
  );
}

function StatusPill({ profile: p }: { profile: Profile }) {
  if (!p.active) return <Pill tone="muted">Sin acceso</Pill>;
  if (p.must_change_password) {
    const valid = p.temp_password_expires_at && new Date(p.temp_password_expires_at) > new Date();
    return valid ? <Pill tone="accent">Clave temporal</Pill> : <Pill tone="warn">Clave vencida</Pill>;
  }
  return <Pill tone="ok">Activo</Pill>;
}

/** Muestra el email y la contraseña temporal con botón de copiar y cuenta regresiva. */
export function CredentialsCard({ creds, name }: { creds: TempCredentials; name?: string }) {
  const left = useCountdown(creds.expires_at, TEMP_PASSWORD_SECONDS);
  const [copied, setCopied] = useState(false);
  const url = window.location.origin;
  const text = `¡Hola${name ? ` ${name.split(' ')[0]}` : ''}! Ya tenés acceso a Genesis.\n\nIngresá en: ${url}\nEmail: ${creds.email}\nContraseña temporal: ${creds.password}\n\nLa contraseña vence en 10 minutos. Al ingresar te va a pedir que elijas una nueva.`;

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="creds">
      <dl className="creds__box">
        <dt>Ingreso</dt><dd>{url}</dd>
        <dt>Email</dt><dd>{creds.email}</dd>
        <dt>Contraseña</dt><dd>{creds.password}</dd>
      </dl>
      <p className="creds__timer">
        {left > 0 ? <>Vence en <strong>{mmss(left)}</strong>. Al ingresar se le pide elegir una contraseña nueva.</> : <strong>La contraseña temporal venció. Generá una nueva.</strong>}
      </p>
      <button type="button" className="btn btn--primary btn--lg" onClick={copy} disabled={left === 0}>
        {copied ? '¡Datos copiados!' : 'Copiar datos de acceso'}
      </button>
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'superadmin'>('member');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [creds, setCreds] = useState<TempCredentials | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await adminUsers<TempCredentials>({ action: 'create', email, full_name: fullName, role });
      setCreds(result);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (creds) {
    return (
      <Modal title={`Usuario creado: ${fullName || creds.email}`} onClose={onClose}>
        <CredentialsCard creds={creds} name={fullName} />
      </Modal>
    );
  }

  return (
    <Modal title="Nuevo usuario" onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Nombre y apellido" full><input className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus /></Field>
        <Field label="Email" full><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Tipo de cuenta" full>
          <div className="role-pick">
            <button type="button" className={`chip${role === 'member' ? ' is-active' : ''}`} onClick={() => setRole('member')}>Miembro del campus</button>
            <button type="button" className={`chip${role === 'superadmin' ? ' is-active' : ''}`} onClick={() => setRole('superadmin')}>Admin</button>
          </div>
        </Field>
        <p className="muted aform__note afield--full">Se genera una contraseña temporal que dura 10 minutos. En el primer ingreso se le pide elegir una propia. Si existe un cliente con el mismo email, se vincula automáticamente.</p>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={saving}>{saving ? 'Creando…' : 'Crear usuario'}</button>
        </div>
      </form>
    </Modal>
  );
}

interface Row {
  profile: Profile;
  summary: ReturnType<typeof summarizeProgress>;
  responses: Awaited<ReturnType<typeof fetchResponses>>;
  client?: Awaited<ReturnType<typeof fetchClients>>[number];
}

function UserDetail({ row, formTitle, onClose, onChanged }: { row: Row; formTitle: (id: string) => string; onClose: () => void; onChanged: () => void }) {
  const { profile: me } = useAuth();
  const { profile: p, summary, responses, client } = row;
  const [msg, setMsg] = useState('');
  const isMe = me?.id === p.id;

  const update = async (patch: Partial<Profile>) => {
    const { error } = await supabase.from('profiles').update(patch).eq('id', p.id);
    setMsg(error ? error.message : 'Guardado');
    onChanged();
  };

  const [creds, setCreds] = useState<TempCredentials | null>(null);
  const [busy, setBusy] = useState(false);

  const resetPassword = async () => {
    if (!window.confirm(`¿Generar una contraseña temporal nueva para ${p.full_name || p.email}? La actual deja de funcionar.`)) return;
    setBusy(true);
    try {
      setCreds(await adminUsers<TempCredentials>({ action: 'reset_temp_password', user_id: p.id }));
      setMsg('');
      onChanged();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async () => {
    if (!window.confirm(`¿Eliminar a ${p.full_name || p.email}? Se borra su cuenta y su progreso. Sus respuestas a formularios y su ficha de cliente se conservan. No se puede deshacer.`)) return;
    setBusy(true);
    try {
      await adminUsers({ action: 'delete', user_id: p.id });
      onChanged();
      onClose();
    } catch (err) {
      setMsg((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={p.full_name || p.email} onClose={onClose} wide>
      <div className="detail-meta">
        <span>{p.email}</span>
        <span>Alta: {fmtDate(p.created_at)}</span>
        <span>Última actividad: {relativeTime(p.last_seen_at)}</span>
        <StatusPill profile={p} />
        {client && <Link className="link" to={`/admin/clientes/${client.id}`}>Ver ficha de cliente →</Link>}
      </div>

      <h3 className="section-title">Avance · {summary.overallPercent}%</h3>
      <div className="list">
        {summary.perModule.map((m) => (
          <div key={m.module.id} className="row row--static">
            <span className="row__num">{String(m.module.number).padStart(2, '0')}</span>
            <div className="row__body">
              <div className="row__head"><span>{m.module.title}</span><span className="muted">{m.done}/{m.total}</span></div>
              <ProgressBar percent={m.percent} />
            </div>
          </div>
        ))}
      </div>

      <h3 className="section-title">Formularios respondidos ({responses.length})</h3>
      {responses.length === 0 && <p className="muted">Todavía no respondió formularios.</p>}
      <ul className="mini-list">
        {responses.map((r) => (
          <li key={r.id}>
            <Link to={`/admin/respuestas/${r.id}`} className="mini-list__item">
              <span>{r.slot_label ?? formTitle(r.form_id)}</span>
              <span className="muted">{fmtDateTime(r.submitted_at)}</span>
            </Link>
          </li>
        ))}
      </ul>

      <h3 className="section-title">Acceso</h3>
      <div className="aform__actions aform__actions--start">
        <button className="btn btn--ghost" disabled={isMe} onClick={() => update({ active: !p.active })}>
          {p.active ? 'Quitar acceso' : 'Dar acceso'}
        </button>
        <button className="btn btn--ghost" disabled={isMe} onClick={() => update({ role: p.role === 'superadmin' ? 'member' : 'superadmin' })}>
          {p.role === 'superadmin' ? 'Quitar admin' : 'Hacer admin'}
        </button>
        <button className="btn btn--ghost" disabled={busy} onClick={resetPassword}>Generar contraseña temporal</button>
        <button className="btn btn--ghost btn--danger" disabled={isMe || busy} onClick={removeUser}>Eliminar usuario</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
      {creds && (
        <>
          <h3 className="section-title">Nuevos datos de acceso</h3>
          <CredentialsCard creds={creds} name={p.full_name} />
        </>
      )}
    </Modal>
  );
}
