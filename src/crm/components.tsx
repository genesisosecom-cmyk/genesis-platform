import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Field, Modal, Pill } from '../admin/ui';
import { fmtDateTime, fmtMoney } from '../lib/format';
import type { LeadEvent, PostClassStatus, SalesCall, SalesRep } from '../lib/types';
import {
  addNote,
  CLOSED_STATUSES,
  isoToLocal,
  localToIso,
  openReceipt,
  scheduleCall,
  setNextAction,
  setStatus,
  waLink,
  type LeadRow,
} from './api';

export type Mode = 'sdr' | 'closer' | 'admin';

/** Estados que cada rol puede elegir a mano (igual que crm_set_status en la base). */
const MANUAL_STATUSES: Record<Mode, PostClassStatus[]> = {
  sdr: ['Nuevo lead', 'No atendió', 'No se cerró'],
  closer: ['No se cerró', 'Cliente'],
  admin: ['Nuevo lead', 'No atendió', 'No se cerró', 'Cliente · falta onboarding', 'Cliente'],
};

export function StatusPill({ status }: { status: PostClassStatus | null }) {
  if (!status) return <Pill tone="muted">Sin estado</Pill>;
  const tone = status === 'Cliente' || status === 'Cliente · falta onboarding' ? 'ok' : status === 'Agendado' ? 'accent' : status === 'No se cerró' ? 'muted' : 'warn';
  return <Pill tone={tone}>{status}</Pill>;
}

export function WhatsAppButton({ phone, small }: { phone: string | null; small?: boolean }) {
  const href = waLink(phone);
  if (!href) return <span className="muted">Sin teléfono</span>;
  return (
    <a className={`btn btn--wa${small ? ' btn--sm' : ''}`} href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
      WhatsApp
    </a>
  );
}

const repName = (reps: SalesRep[], id: string | null) => (id ? reps.find((r) => r.id === id)?.name ?? '—' : null);

/** Datos del lead: contacto, inversión, landing, grupo, aplicación, SDR y closer. */
export function LeadSummary({ row, reps }: { row: LeadRow; reps: SalesRep[] }) {
  const l = row.lead;
  const items: [string, ReactNode][] = [
    ['Email', l.email ?? '—'],
    ['Teléfono', l.phone ? `+${l.phone}` : '—'],
    ['Inversión en Meta', row.inversion_meta ?? '—'],
    ['Califica', row.califica === null ? '—' : row.califica ? <Pill tone="ok">Sí · 100 USD/día o más</Pill> : <Pill tone="muted">No</Pill>],
    ['Versión de landing', row.variant ?? '—'],
    ['Fuente', row.source ?? '—'],
    ['Optin', fmtDateTime(row.optin_at)],
    ['Grupo de WhatsApp', row.toco_grupo ? <Pill tone="accent">Entró · {fmtDateTime(row.toco_grupo_at)}</Pill> : 'No'],
    ['Aplicó', row.route === 'aplicado' ? <Pill tone="ok">{fmtDateTime(row.applied_at)}</Pill> : row.route === 'rechazado' ? <Pill tone="muted">Próximo ciclo</Pill> : 'No'],
    ['SDR', repName(reps, l.sdr_id) ?? 'Sin asignar'],
    ['Closer', repName(reps, row.closer_id) ?? '—'],
    ['Intentos de contacto', row.contact_attempts],
  ];
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k} className="kv__row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const APPLICATION_FIELDS: [string, string][] = [
  ['objetivo', 'Objetivo'],
  ['freno', 'Freno'],
  ['hace_cuanto', 'Hace cuánto'],
  ['conoce_manu', 'Conoce a Manu'],
  ['por_que_ahora', 'Por qué ahora'],
  ['ciclo', 'Ciclo'],
  ['facturacion', 'Facturación'],
  ['inversion', 'Inversión'],
];

export function ApplicationAnswers({ row }: { row: LeadRow }) {
  if (!row.application) return <p className="muted">Todavía no aplicó.</p>;
  const a = row.application as Record<string, unknown>;
  return (
    <dl className="answers">
      {APPLICATION_FIELDS.filter(([k]) => a[k]).map(([k, label]) => (
        <div key={k} className="answers__item">
          <dt>{label}</dt>
          <dd>{String(a[k])}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Timeline({ events }: { events: LeadEvent[] }) {
  if (!events.length) return <p className="muted">Sin eventos.</p>;
  return (
    <ol className="timeline">
      {events.map((e) => (
        <li key={e.id} className={`timeline__item timeline__item--${e.kind}`}>
          <div className="timeline__meta">
            {fmtDateTime(e.created_at)} · {e.created_by_name ?? 'Automático'}
          </div>
          <div className="timeline__text">{e.summary}</div>
        </li>
      ))}
    </ol>
  );
}

export function CallsList({ calls, reps, linkCalls }: { calls: SalesCall[]; reps: SalesRep[]; linkCalls: boolean }) {
  if (!calls.length) return <p className="muted">Sin llamadas agendadas.</p>;
  return (
    <ul className="mini-list">
      {calls.map((c) => {
        const body = (
          <>
            <span>
              <strong>{fmtDateTime(c.scheduled_at)}</strong>
              <span className="muted"> · {repName(reps, c.closer_id) ?? '—'}</span>
            </span>
            <CallStatePill call={c} />
          </>
        );
        return (
          <li key={c.id}>
            {linkCalls ? <Link to={`/closer/${c.id}`} className="mini-list__item">{body}</Link> : <div className="mini-list__item">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function CallStatePill({ call }: { call: SalesCall }) {
  if (call.status === 'cancelada') return <Pill tone="muted">Cancelada</Pill>;
  if (call.result === 'cerro') return <Pill tone="ok">Cerró · {fmtMoney(Number(call.amount_total), call.currency)}</Pill>;
  if (call.result === 'no_cerro') return <Pill tone="muted">No se cerró</Pill>;
  if (new Date(call.scheduled_at) < new Date()) return <Pill tone="warn">Sin resultado</Pill>;
  return <Pill tone="accent">Agendada</Pill>;
}

export function ReceiptLink({ path }: { path: string | null }) {
  if (!path) return null;
  return (
    <button type="button" className="link link--btn" onClick={() => openReceipt(path)}>
      Ver comprobante
    </button>
  );
}

/** Estado, notas, próxima tarea y agenda. Cada acción queda en el historial. */
export function LeadActions({ row, reps, mode, onDone }: { row: LeadRow; reps: SalesRep[]; mode: Mode; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [task, setTask] = useState(row.next_action ?? '');
  const [taskAt, setTaskAt] = useState(isoToLocal(row.next_action_at));
  const [scheduling, setScheduling] = useState(false);

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after?.();
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (s: PostClassStatus) => {
    if (s === row.post_class_status && s !== 'No atendió') return;
    if (s === 'Cliente' && !window.confirm('¿Confirmás que el cliente ya hizo el onboarding?')) return;
    run(() => setStatus(row.id, s));
  };

  const submitNote = (e: FormEvent) => {
    e.preventDefault();
    if (note.trim()) run(() => addNote(row.id, note), () => setNote(''));
  };

  const submitTask = (e: FormEvent) => {
    e.preventDefault();
    run(() => setNextAction(row.id, task, localToIso(taskAt)));
  };

  const canSchedule = mode === 'sdr' || mode === 'admin';
  const taskDirty = task !== (row.next_action ?? '') || taskAt !== isoToLocal(row.next_action_at);

  return (
    <div className="lead-actions">
      <div>
        <span className="afield__label">Estado post-clase</span>
        <div className="chips">
          {MANUAL_STATUSES[mode].map((s) => (
            <button key={s} type="button" disabled={busy} className={`chip chip--sm${row.post_class_status === s ? ' is-active' : ''}`} onClick={() => changeStatus(s)}>
              {s}
              {s === 'No atendió' && row.contact_attempts > 0 ? ` (${row.contact_attempts})` : ''}
            </button>
          ))}
          {canSchedule && (
            <button type="button" disabled={busy} className={`chip chip--sm${row.post_class_status === 'Agendado' ? ' is-active' : ''}`} onClick={() => setScheduling(true)}>
              {row.post_class_status === 'Agendado' ? 'Agendado · reagendar' : 'Agendar con closer'}
            </button>
          )}
        </div>
      </div>

      <form className="aform" onSubmit={submitTask}>
        <Field label="Próxima tarea">
          <input className="field" value={task} onChange={(e) => setTask(e.target.value)} placeholder="Ej: volver a llamar" />
        </Field>
        <Field label="Fecha y hora">
          <input className="field" type="datetime-local" value={taskAt} onChange={(e) => setTaskAt(e.target.value)} />
        </Field>
        {taskDirty && (
          <div className="aform__actions afield--full">
            <button className="btn btn--primary btn--sm" disabled={busy}>Guardar tarea</button>
          </div>
        )}
      </form>

      <form className="note-form" onSubmit={submitNote}>
        <textarea className="field field--area" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Agregar una nota…" />
        <button className="btn btn--ghost btn--sm" disabled={busy || !note.trim()}>Agregar nota</button>
      </form>

      {error && <p className="state--error">{error}</p>}

      {scheduling && (
        <ScheduleModal
          row={row}
          closers={reps.filter((r) => r.closer_status === 'activo')}
          onClose={() => setScheduling(false)}
          onSaved={() => {
            setScheduling(false);
            onDone();
          }}
        />
      )}
    </div>
  );
}

function ScheduleModal({ row, closers, onClose, onSaved }: { row: LeadRow; closers: SalesRep[]; onClose: () => void; onSaved: () => void }) {
  const [closerId, setCloserId] = useState(row.closer_id && closers.some((c) => c.id === row.closer_id) ? row.closer_id : closers[0]?.id ?? '');
  const [at, setAt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!closerId || !at) return setError('Elegí closer, fecha y hora.');
    setBusy(true);
    setError(null);
    try {
      await scheduleCall(row.id, closerId, localToIso(at)!, note);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Agendar llamada · ${row.lead.full_name || row.lead.email || 'lead'}`} onClose={onClose}>
      {closers.length === 0 ? (
        <p className="muted">No hay closers activos. Pedile al admin que cargue uno en Equipo.</p>
      ) : (
        <form className="aform" onSubmit={submit}>
          <Field label="Closer">
            <select className="field field--select" value={closerId} onChange={(e) => setCloserId(e.target.value)}>
              {closers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Fecha y hora de la llamada">
            <input className="field" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required />
          </Field>
          <Field label="Nota para el closer" full>
            <textarea className="field field--area" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contexto del lead, objeciones, qué le interesa…" />
          </Field>
          {row.post_class_status === 'Agendado' && <p className="muted afield--full">La llamada anterior se cancela y queda esta.</p>}
          {error && <p className="login__error afield--full">{error}</p>}
          <div className="aform__actions afield--full">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn--primary" disabled={busy}>{busy ? 'Agendando…' : 'Agendar'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export const isClosed = (r: LeadRow) => CLOSED_STATUSES.includes(r.post_class_status);
