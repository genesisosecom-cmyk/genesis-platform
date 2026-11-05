import { useEffect, useState, type FormEvent } from 'react';
import { Field, Modal } from '../ui';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import {
  commentTask,
  createTask,
  deleteTask,
  EDITABLE,
  fetchTaskDetail,
  STATUSES,
  STATUS_CLASS,
  updateTask,
  type Conflict,
  type Task,
  type TaskFields,
  type TaskPerson,
  type TaskPhase,
} from './api';

const LABELS: Record<keyof TaskFields, string> = {
  title: 'Título',
  phase: 'Fase',
  quantity: 'Cantidad',
  status: 'Estado',
  responsible_name: 'Responsable',
  due_date: 'Fecha límite',
  agent: 'Agente',
  reference: 'Referencia',
  link: 'Link al entregable',
  notes: 'Notas',
};

const pick = (t: Task): TaskFields => Object.fromEntries(EDITABLE.map((k) => [k, t[k]])) as TaskFields;
const show = (k: keyof TaskFields, v: unknown) => (k === 'due_date' ? (v ? fmtDate(String(v)) : 'sin fecha') : v === '' || v === null ? '—' : String(v));

/** Ficha de la tarea (o alta, con task = null). */
export default function TaskModal({
  task,
  people,
  phases,
  defaults,
  onClose,
  onChanged,
}: {
  task: Task | null;
  people: TaskPerson[];
  phases: TaskPhase[];
  defaults?: Partial<TaskFields>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const creating = !task;
  const blank: TaskFields = {
    title: '', phase: phases[0]?.name ?? '', quantity: 1, status: 'Por hacer', responsible_name: '', due_date: null,
    agent: '', reference: '', link: '', notes: '', ...defaults,
  };
  // base = lo que había al abrir (o al último guardado); draft = lo que se está editando.
  const [base, setBase] = useState<TaskFields>(task ? pick(task) : blank);
  const [draft, setDraft] = useState<TaskFields>(task ? pick(task) : blank);
  const [dueTouched, setDueTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [saved, setSaved] = useState(false);

  const dirty = EDITABLE.filter((k) => draft[k] !== base[k]);

  // Si otro cambia la tarea mientras está abierta, los campos que no tocaste se actualizan solos.
  useEffect(() => {
    if (!task) return;
    const fresh = pick(task);
    const untouched = EDITABLE.filter((k) => draft[k] === base[k]);
    if (!untouched.length) return;
    setBase((b) => ({ ...b, ...Object.fromEntries(untouched.map((k) => [k, fresh[k]])) }));
    setDraft((d) => ({ ...d, ...Object.fromEntries(untouched.map((k) => [k, fresh[k]])) }));
    // Solo cuando llega una versión nueva de la tarea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.version]);

  const set = <K extends keyof TaskFields>(k: K, v: TaskFields[K]) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [k]: v }));
  };

  const save = async (e?: FormEvent, overrides?: Partial<TaskFields>) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (creating) {
        const fields: Partial<TaskFields> = { ...draft };
        if (!dueTouched) delete fields.due_date; // sin fecha elegida: la calcula la base según la fase
        await createTask(fields);
        onChanged();
        onClose();
        return;
      }
      const keys = dirty;
      if (!keys.length) return;
      const changes = Object.fromEntries(keys.map((k) => [k, draft[k] ?? (k === 'due_date' ? '' : draft[k])]));
      const expected = { ...Object.fromEntries(keys.map((k) => [k, base[k] ?? (k === 'due_date' ? '' : base[k])])), ...overrides };
      const r = await updateTask(task!.id, changes, expected);
      const fresh = pick(r.task);
      // Lo guardado pasa a ser la nueva base; lo que quedó en conflicto sigue en el borrador.
      const conflicted = new Set(r.conflicts.map((c) => c.field));
      setBase(fresh);
      setDraft((d) => Object.fromEntries(EDITABLE.map((k) => [k, conflicted.has(k) ? d[k] : fresh[k]])) as TaskFields);
      setConflicts(r.conflicts);
      setSaved(r.applied > 0 && !r.conflicts.length);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Resolver un conflicto: quedarse con el valor del otro o volver a guardar el propio. */
  const resolve = (c: Conflict, keepMine: boolean) => {
    if (!keepMine) {
      setDraft((d) => ({ ...d, [c.field]: base[c.field] }));
      setConflicts((cs) => cs.filter((x) => x.field !== c.field));
      return;
    }
    setConflicts((cs) => cs.filter((x) => x.field !== c.field));
    save(undefined, { [c.field]: c.current } as Partial<TaskFields>);
  };

  const remove = async () => {
    if (!task || !window.confirm(`¿Borrar ${task.id} · ${task.title}? Se borran también sus comentarios e historial.`)) return;
    setBusy(true);
    try {
      await deleteTask(task.id);
      onChanged();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const responsibleOptions = people.filter((p) => p.active || p.name === draft.responsible_name);

  return (
    <Modal title={creating ? 'Nueva tarea' : `${task!.id} · ${task!.title}`} onClose={onClose} wide>
      <form className="aform" onSubmit={save}>
        <Field label="Título" full>
          <input className="field" maxLength={200} value={draft.title} onChange={(e) => set('title', e.target.value)} autoFocus={creating} />
        </Field>
        <Field label="Fase">
          <select className="field field--select" value={draft.phase} onChange={(e) => set('phase', e.target.value)}>
            {phases.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Estado">
          <select className={`field field--select tstatus-select tstatus--${STATUS_CLASS[draft.status]}`} value={draft.status} onChange={(e) => set('status', e.target.value as TaskFields['status'])}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Responsable">
          <select className="field field--select" value={draft.responsible_name} onChange={(e) => set('responsible_name', e.target.value)}>
            <option value="">Sin asignar</option>
            {responsibleOptions.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={creating && !dueTouched ? 'Fecha límite (por defecto, según la fase)' : 'Fecha límite'}>
          <input className="field" type="date" value={draft.due_date ?? ''} onChange={(e) => { setDueTouched(true); set('due_date', e.target.value || null); }} />
        </Field>
        <Field label="Cantidad">
          <input className="field" type="number" min={1} max={999} value={draft.quantity} onChange={(e) => set('quantity', Math.max(1, Math.min(999, Number(e.target.value) || 1)))} />
        </Field>
        <Field label="Agente (del repo)" full>
          <input className="field" maxLength={300} value={draft.agent} onChange={(e) => set('agent', e.target.value)} />
        </Field>
        <Field label="Referencia" full>
          <textarea className="field field--area" rows={2} maxLength={600} value={draft.reference} onChange={(e) => set('reference', e.target.value)} />
        </Field>
        <Field label="Link al entregable" full>
          <div className="filters" style={{ marginBottom: 0 }}>
            <input className="field" style={{ flex: 1 }} type="url" maxLength={500} value={draft.link} onChange={(e) => set('link', e.target.value)} placeholder="https://…" />
            {draft.link && <a className="btn btn--ghost btn--sm" href={draft.link} target="_blank" rel="noopener noreferrer">Abrir</a>}
          </div>
        </Field>
        <Field label="Notas" full>
          <textarea className="field field--area" rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>

        {conflicts.length > 0 && (
          <div className="afield--full tconflicts">
            <strong>Alguien cambió esto mientras editabas (no se pisó nada):</strong>
            {conflicts.map((c) => (
              <div key={c.field} className="tconflict">
                <span>
                  <b>{LABELS[c.field]}</b>: {c.by ?? 'Otra persona'} lo puso en «{show(c.field, c.current)}»{c.at ? ` (${fmtDateTime(c.at)})` : ''}. Tu cambio: «{show(c.field, draft[c.field])}».
                </span>
                <span className="filters" style={{ marginBottom: 0 }}>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => resolve(c, false)}>Dejar el suyo</button>
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => resolve(c, true)}>Guardar el mío</button>
                </span>
              </div>
            ))}
          </div>
        )}
        {error && <p className="login__error afield--full">{error}</p>}

        <div className="aform__actions afield--full">
          {!creating && <button type="button" className="btn btn--danger" onClick={remove} disabled={busy}>Borrar</button>}
          {!creating && <span className="muted" style={{ marginRight: 'auto' }}>{saved ? 'Guardado ✓' : dirty.length ? `${dirty.length} cambio(s) sin guardar` : `Editada por ${task!.updated_by_name || '—'} · ${fmtDateTime(task!.updated_at)}`}</span>}
          <button type="button" className="btn btn--ghost" onClick={onClose}>{creating ? 'Cancelar' : 'Cerrar'}</button>
          <button className="btn btn--primary" disabled={busy || (!creating && !dirty.length) || !draft.title.trim()}>
            {busy ? 'Guardando…' : creating ? 'Crear tarea' : 'Guardar'}
          </button>
        </div>
      </form>

      {task && <TaskActivity task={task} />}
    </Modal>
  );
}

/** Comentarios e historial de la tarea (se recargan cuando la tarea cambia). */
function TaskActivity({ task }: { task: Task }) {
  const { data, reload } = useAsync(() => fetchTaskDetail(task.id), [task.id, task.updated_at]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await commentTask(task.id, body);
      setBody('');
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="two-col tactivity">
      <section>
        <h3 className="section-title section-title--sm">Comentarios · {data?.comments.length ?? 0}</h3>
        <ul className="tcomments">
          {data?.comments.map((c) => (
            <li key={c.id}>
              <div className="timeline__meta">{c.author_name} · {fmtDateTime(c.created_at)}</div>
              <div className="timeline__text">{c.body}</div>
            </li>
          ))}
        </ul>
        <form className="note-form" onSubmit={send}>
          <textarea className="field field--area" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribí un comentario…" />
          <button className="btn btn--ghost btn--sm" disabled={busy || !body.trim()}>Comentar</button>
        </form>
        {error && <p className="state--error">{error}</p>}
      </section>
      <section>
        <h3 className="section-title section-title--sm">Historial</h3>
        <ol className="timeline">
          {data?.events.map((ev) => (
            <li key={ev.id} className="timeline__item">
              <div className="timeline__meta">{fmtDateTime(ev.created_at)} · {ev.author_name}</div>
              <div className="timeline__text">{ev.what}</div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
