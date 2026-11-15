import { useState, type FormEvent } from 'react';
import { supabase, unwrap } from '../../lib/supabase';
import { adminUsers, type TempCredentials } from '../../lib/adminUsers';
import type { Client, Profile } from '../../lib/types';
import { Field, Modal } from '../ui';
import { CredentialsCard } from '../UsersPage';

/** Crea el usuario del campus para un cliente y lo deja vinculado a su ficha. */
export function GiveAccessModal({ client, onClose, onDone }: { client: Client; onClose: () => void; onDone: () => void }) {
  const [fullName, setFullName] = useState(client.full_name);
  const [email, setEmail] = useState(client.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [creds, setCreds] = useState<TempCredentials | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await adminUsers<TempCredentials>({ action: 'create', email, full_name: fullName, role: 'member', client_id: client.id });
      // Si el cliente no tenía email, le guardamos el del acceso.
      if (!client.email) await supabase.from('clients').update({ email: res.email }).eq('id', client.id);
      setCreds(res);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (creds) {
    return (
      <Modal title={`Acceso creado: ${fullName}`} onClose={onClose}>
        <p className="muted">Mandale este mensaje por WhatsApp. Ya incluye el link al formulario de onboarding.</p>
        <CredentialsCard creds={creds} name={fullName} />
      </Modal>
    );
  }

  return (
    <Modal title={`Dar acceso al campus · ${client.full_name}`} onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Nombre y apellido" full><input className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></Field>
        <Field label="Email con el que va a ingresar" full><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!email} /></Field>
        <p className="muted aform__note afield--full">
          Se crea el usuario con una contraseña temporal, queda vinculado a esta ficha (pagos, programa y formularios) y al ingresar se le pide completar el onboarding.
        </p>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Creando…' : 'Crear acceso'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Vincula un usuario existente del campus a la ficha del cliente. */
export function LinkUserModal({ client, profiles, linkedIds, onClose, onDone }: {
  client: Client;
  profiles: Profile[];
  /** Usuarios que ya tienen ficha de cliente (se listan al final). */
  linkedIds: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const members = profiles.filter((p) => p.role === 'member');
  const free = members.filter((p) => !linkedIds.has(p.id));
  const taken = members.filter((p) => linkedIds.has(p.id));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return setError('Elegí un usuario');
    try {
      unwrap(await supabase.from('clients').update({ profile_id: userId }).eq('id', client.id));
      onDone();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const label = (p: Profile) => `${p.full_name || 'Sin nombre'} · ${p.email}`;
  return (
    <Modal title={`Vincular usuario · ${client.full_name}`} onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Usuario del campus" full>
          <select className="field" value={userId} onChange={(e) => setUserId(e.target.value)} autoFocus>
            <option value="">Elegí…</option>
            {free.length > 0 && <optgroup label="Sin ficha de cliente">{free.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</optgroup>}
            {taken.length > 0 && <optgroup label="Ya vinculados a otro cliente">{taken.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</optgroup>}
          </select>
        </Field>
        <p className="muted aform__note afield--full">Usalo cuando el alumno ya tenía usuario con otro email. Su avance y su onboarding pasan a verse en esta ficha.</p>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary">Vincular</button>
        </div>
      </form>
    </Modal>
  );
}

/** Desde el usuario: elige a qué ficha de cliente pertenece. */
export function LinkClientModal({ profile, clients, onClose, onDone }: { profile: Profile; clients: Client[]; onClose: () => void; onDone: () => void }) {
  const [clientId, setClientId] = useState('');
  const [error, setError] = useState('');
  const free = clients.filter((c) => !c.profile_id);
  const taken = clients.filter((c) => c.profile_id && c.profile_id !== profile.id);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientId) return setError('Elegí un cliente');
    try {
      unwrap(await supabase.from('clients').update({ profile_id: profile.id }).eq('id', clientId));
      onDone();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const label = (c: Client) => [c.full_name, c.program, c.email].filter(Boolean).join(' · ');
  return (
    <Modal title={`Vincular a un cliente · ${profile.full_name || profile.email}`} onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Ficha de cliente" full>
          <select className="field" value={clientId} onChange={(e) => setClientId(e.target.value)} autoFocus>
            <option value="">Elegí…</option>
            {free.length > 0 && <optgroup label="Sin usuario">{free.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}</optgroup>}
            {taken.length > 0 && <optgroup label="Con otro usuario (se reemplaza)">{taken.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}</optgroup>}
          </select>
        </Field>
        <p className="muted aform__note afield--full">
          Si todavía no tiene ficha, creala en Clientes y pagos (o se crea sola cuando el closer registra la venta) y después vinculala acá.
        </p>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary">Vincular</button>
        </div>
      </form>
    </Modal>
  );
}
