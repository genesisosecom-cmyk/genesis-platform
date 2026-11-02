import { useState, type FormEvent } from 'react';
import { Field, Modal } from '../admin/ui';
import type { CrmAgent, CrmResource, SalesRep } from '../lib/types';
import { createLead, localToIso, logAgents, type LeadRow } from './api';
import { INVESTMENT_LEVELS } from './model';

const MAX_AGENTS = 3;

/** Elegir hasta 3 agentes, armar el mensaje y mandarlo por WhatsApp o copiarlo. Queda en el lead. */
export function AgentsModal({ row, agents, onClose, onSent }: { row: LeadRow; agents: CrmAgent[]; onClose: () => void; onSent: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = (row.lead.full_name || '').split(' ')[0];

  const compose = (ids: string[]) =>
    [`¡Hola${first ? ` ${first}` : ''}! Te paso los agentes que te comenté:`, ...agents.filter((a) => ids.includes(a.id)).map((a) => `• ${a.name}${a.message ? `\n${a.message}` : ''}`)].join('\n\n');

  const toggle = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < MAX_AGENTS ? [...picked, id] : picked;
    setPicked(next);
    if (!edited) setText(compose(next));
  };

  const send = async (channel: 'whatsapp' | 'copia') => {
    if (!picked.length) return setError('Elegí al menos un agente.');
    setError(null);
    // La pestaña se abre antes del await para que el navegador no la bloquee.
    const win = channel === 'whatsapp' && row.lead.phone ? window.open(`https://wa.me/${row.lead.phone}?text=${encodeURIComponent(text)}`, '_blank') : null;
    try {
      if (channel === 'copia') await navigator.clipboard.writeText(text);
      await logAgents(row.id, picked, channel);
      onSent();
    } catch (e) {
      win?.close();
      setError((e as Error).message);
    }
  };

  return (
    <Modal title={`Agentes para ${row.lead.full_name || 'el lead'}`} onClose={onClose} wide>
      {agents.length === 0 ? (
        <p className="muted">Todavía no hay agentes cargados. El admin los carga en Configuración CRM.</p>
      ) : (
        <div className="aform">
          <div className="afield--full">
            <span className="afield__label">Elegí hasta {MAX_AGENTS} según el caso del lead ({picked.length}/{MAX_AGENTS})</span>
            <div className="agent-grid">
              {agents.map((a) => (
                <button key={a.id} type="button" className={`agent${picked.includes(a.id) ? ' is-on' : ''}`} onClick={() => toggle(a.id)} disabled={!picked.includes(a.id) && picked.length >= MAX_AGENTS}>
                  <strong>{a.name}</strong>
                  {a.description && <small>{a.description}</small>}
                </button>
              ))}
            </div>
          </div>
          <Field label="Mensaje" full>
            <textarea className="field field--area" rows={8} value={text} onChange={(e) => { setText(e.target.value); setEdited(true); }} />
          </Field>
          {error && <p className="login__error afield--full">{error}</p>}
          <div className="aform__actions afield--full">
            <button type="button" className="btn btn--ghost" onClick={() => send('copia')}>Copiar mensaje</button>
            <button type="button" className="btn btn--primary" disabled={!row.lead.phone} onClick={() => send('whatsapp')}>Abrir en WhatsApp</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Links y guiones que carga el admin. */
export function ResourcesModal({ resources, role, onClose }: { resources: CrmResource[]; role: 'sdr' | 'closer'; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const list = resources.filter((r) => r.active && (r.audience === 'todos' || r.audience === role));
  const copy = async (r: CrmResource) => {
    await navigator.clipboard.writeText(r.body ?? '');
    setCopied(r.id);
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <Modal title="Recursos" onClose={onClose} wide>
      {list.length === 0 && <p className="muted">Todavía no hay recursos cargados.</p>}
      <div className="stack">
        {list.map((r) => (
          <section key={r.id} className="glass panel">
            <div className="panel__head">
              <h3 className="panel__title">{r.title}</h3>
              {r.kind === 'link' && r.url ? (
                <a className="btn btn--ghost btn--sm" href={r.url} target="_blank" rel="noopener noreferrer">Abrir</a>
              ) : (
                <button className="btn btn--ghost btn--sm" onClick={() => copy(r)}>{copied === r.id ? '¡Copiado!' : 'Copiar'}</button>
              )}
            </div>
            {r.kind === 'guion' && <p className="notes">{r.body}</p>}
          </section>
        ))}
      </div>
    </Modal>
  );
}

/** Carga manual (DM, referido…). Queda asignado a quien lo crea si lo elige. */
export function NewLeadModal({ closers, canAssign, onClose, onCreated }: { closers: SalesRep[]; canAssign: boolean; onClose: () => void; onCreated: () => void }) {
  const [v, setV] = useState({ name: '', email: '', phone: '', inversion: '', origin: 'DM de Instagram', assignMe: canAssign, closerId: '', callAt: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return setError('Falta el nombre.');
    if (!v.email.trim() && !v.phone.trim()) return setError('Cargá el mail o el WhatsApp.');
    if (Boolean(v.closerId) !== Boolean(v.callAt)) return setError('Para agendar elegí closer y fecha de la call.');
    setBusy(true);
    setError(null);
    try {
      await createLead({ ...v, closerId: v.closerId || null, callAt: localToIso(v.callAt) });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Nuevo lead" onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Nombre *" full><input className="field" value={v.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Mail"><input className="field" type="email" value={v.email} onChange={set('email')} /></Field>
        <Field label="WhatsApp (con código de país)"><input className="field" value={v.phone} onChange={set('phone')} placeholder="+54 9 11 …" /></Field>
        <Field label="Inversión diaria en Meta">
          <select className="field field--select" value={v.inversion} onChange={set('inversion')}>
            <option value="">Sin dato</option>
            {INVESTMENT_LEVELS.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Origen">
          <input className="field" list="lead-origins" value={v.origin} onChange={set('origin')} />
          <datalist id="lead-origins">{['DM de Instagram', 'Referido', 'WhatsApp', 'Evento', 'Otro'].map((o) => <option key={o} value={o} />)}</datalist>
        </Field>
        <Field label="Closer (si ya tiene call)">
          <select className="field field--select" value={v.closerId} onChange={set('closerId')}>
            <option value="">Sin call todavía</option>
            {closers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Fecha de la call">
          <input className="field" type="datetime-local" value={v.callAt} onChange={set('callAt')} disabled={!v.closerId} />
        </Field>
        {canAssign && (
          <label className="check afield--full">
            <input type="checkbox" checked={v.assignMe} onChange={(e) => setV((s) => ({ ...s, assignMe: e.target.checked }))} /> Asignármelo como SDR
          </label>
        )}
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Creando…' : 'Crear'}</button>
        </div>
      </form>
    </Modal>
  );
}
