import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useAsync } from '../../lib/useAsync';
import { fmtDate } from '../../lib/format';
import { EmptyState, Kpi, State } from '../ui';
import {
  fetchPeople,
  fetchPhases,
  fetchTasks,
  isOverdue,
  STATUSES,
  STATUS_CLASS,
  subscribeTasks,
  todayISO,
  updateTask,
  type Task,
  type TaskPerson,
  type TaskPhase,
  type TaskStatus,
} from './api';
import TaskModal from './TaskModal';

type View = 'tablero' | 'lista' | 'mias' | 'resumen';
const VIEWS: [View, string][] = [['tablero', 'Tablero'], ['lista', 'Lista por fase'], ['mias', 'Mis tareas'], ['resumen', 'Resumen por persona']];

const load = () => Promise.all([fetchTasks(), fetchPeople(), fetchPhases()]);

export function StatusPill({ status }: { status: TaskStatus }) {
  return <span className={`tpill tstatus--${STATUS_CLASS[status]}`}>{status}</span>;
}

function Due({ task }: { task: Task }) {
  if (!task.due_date) return <span className="muted">Sin fecha</span>;
  return <span className={isOverdue(task) ? 'text-warn' : undefined}>{isOverdue(task) ? 'Venció ' : ''}{fmtDate(task.due_date)}</span>;
}

export default function TasksPage() {
  const { profile } = useAuth();
  const { data, loading, error, reload } = useAsync(load, []);
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('tablero');
  const [query, setQuery] = useState('');
  const [who, setWho] = useState('all');
  const [phase, setPhase] = useState('all');
  const [status, setStatus] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  // Cambios de estado optimistas mientras se guardan (arrastrar en el tablero).
  const [pending, setPending] = useState<Record<string, TaskStatus>>({});
  const [notice, setNotice] = useState<string | null>(null);

  // Tiempo real: si otro cambia algo, se recarga (agrupando ráfagas de cambios).
  const timer = useRef<number>();
  useEffect(
    () =>
      subscribeTasks(() => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(reload, 300);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [rawTasks = [], people = [], phases = []] = data ?? [];
  const tasks = useMemo(() => rawTasks.map((t) => (pending[t.id] ? { ...t, status: pending[t.id] } : t)), [rawTasks, pending]);
  const openId = params.get('t');
  const open = openId ? tasks.find((t) => t.id === openId) ?? null : null;
  const openTask = (id: string | null) => setParams(id ? { t: id } : {}, { replace: true });

  const q = query.trim().toLowerCase();
  const filtered = tasks.filter(
    (t) =>
      (who === 'all' || (who === 'none' ? !t.responsible_name : t.responsible_name === who)) &&
      (phase === 'all' || t.phase === phase) &&
      (status === 'all' || t.status === status) &&
      (!overdueOnly || isOverdue(t)) &&
      (!q || `${t.id} ${t.title} ${t.agent} ${t.notes}`.toLowerCase().includes(q)),
  );
  const done = tasks.filter((t) => t.status === 'Hecha').length;
  const overdue = tasks.filter((t) => isOverdue(t)).length;

  const moveTo = async (task: Task, next: TaskStatus) => {
    if (task.status === next) return;
    setPending((p) => ({ ...p, [task.id]: next }));
    setNotice(null);
    try {
      const r = await updateTask(task.id, { status: next }, { status: task.status });
      if (r.conflicts.length) setNotice(`${task.id}: ${r.conflicts[0].by ?? 'Otra persona'} ya la había pasado a «${String(r.conflicts[0].current)}». No se cambió.`);
    } catch (e) {
      setNotice(`${task.id}: ${(e as Error).message}`);
    } finally {
      await reload();
      setPending(({ [task.id]: _, ...rest }) => rest);
    }
  };

  return (
    <State loading={loading} error={error}>
      <div className="kpis kpis--4">
        <Kpi label="Tareas" value={tasks.length} hint={`${tasks.filter((t) => t.status !== 'Hecha').length} abiertas`} />
        <Kpi label="Hechas" value={done} tone="ok" hint={tasks.length ? `${Math.round((done / tasks.length) * 100)}%` : undefined} />
        <Kpi label="Vencidas" value={overdue} tone={overdue ? 'warn' : undefined} />
        <Kpi label="Bloqueadas" value={tasks.filter((t) => t.status === 'Bloqueada').length} tone={tasks.some((t) => t.status === 'Bloqueada') ? 'warn' : undefined} />
      </div>

      <div className="toolbar">
        <div className="chips">
          {VIEWS.map(([v, l]) => (
            <button key={v} className={`chip${view === v ? ' is-active' : ''}`} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
        <div className="toolbar__right">
          <input className="field field--search" type="search" placeholder="Buscar código, título…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn btn--primary" onClick={() => setCreating(true)}>+ Nueva tarea</button>
        </div>
      </div>

      {(view === 'tablero' || view === 'lista') && (
        <div className="filters">
          <select className="field field--select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Responsable">
            <option value="all">Todos los responsables</option>
            <option value="none">Sin asignar</option>
            {people.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <select className="field field--select" value={phase} onChange={(e) => setPhase(e.target.value)} aria-label="Fase">
            <option value="all">Todas las fases</option>
            {phases.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          {view === 'lista' && (
            <select className="field field--select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado">
              <option value="all">Todos los estados</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button type="button" className={`chip${overdueOnly ? ' is-active' : ''}`} onClick={() => setOverdueOnly((o) => !o)}>
            Vencidas <span className="muted">{overdue}</span>
          </button>
        </div>
      )}
      {notice && <p className="state--error" style={{ marginBottom: 16 }}>{notice}</p>}

      {tasks.length === 0 ? (
        <EmptyState title="Todavía no hay tareas" text="Creá la primera tarea del lanzamiento." action={{ label: 'Nueva tarea', onClick: () => setCreating(true) }} />
      ) : (
        <>
          {view === 'tablero' && <Board tasks={filtered} onOpen={openTask} onMove={moveTo} />}
          {view === 'lista' && <ByPhase tasks={filtered} phases={phases} onOpen={openTask} />}
          {view === 'mias' && <Mine tasks={tasks} profileId={profile?.id ?? null} people={people} onOpen={openTask} />}
          {view === 'resumen' && <Summary tasks={tasks} people={people} onPick={(name) => { setWho(name); setView('lista'); }} />}
        </>
      )}

      {(open || creating) && (
        <TaskModal
          key={open?.id ?? 'new'}
          task={creating ? null : open}
          people={people}
          phases={phases}
          defaults={creating && phase !== 'all' ? { phase } : undefined}
          onClose={() => { setCreating(false); openTask(null); }}
          onChanged={reload}
        />
      )}
      {openId && !open && !loading && (
        <p className="muted">La tarea {openId} ya no existe.</p>
      )}
    </State>
  );
}

/** Tablero: una columna por estado; se arrastra la tarjeta para cambiarla de estado. */
function Board({ tasks, onOpen, onMove }: { tasks: Task[]; onOpen: (id: string) => void; onMove: (t: Task, s: TaskStatus) => void }) {
  const [over, setOver] = useState<TaskStatus | null>(null);
  const byId = (id: string) => tasks.find((t) => t.id === id);

  const drop = (e: DragEvent, s: TaskStatus) => {
    e.preventDefault();
    setOver(null);
    const t = byId(e.dataTransfer.getData('text/plain'));
    if (t) onMove(t, s);
  };

  return (
    <div className="tboard">
      {STATUSES.map((s) => {
        const col = tasks.filter((t) => t.status === s).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.id.localeCompare(b.id));
        return (
          <section
            key={s}
            className={`tcol tstatus--${STATUS_CLASS[s]}${over === s ? ' is-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(s); }}
            onDragLeave={() => setOver((o) => (o === s ? null : o))}
            onDrop={(e) => drop(e, s)}
          >
            <header className="tcol__head"><span className="tdot" />{s}<span className="muted">{col.length}</span></header>
            <div className="tcol__list">
              {col.map((t) => (
                <article
                  key={t.id}
                  className="tcard glass"
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onClick={() => onOpen(t.id)}
                >
                  <div className="tcard__top"><span className="tcode">{t.id}</span>{t.quantity > 1 && <span className="muted">×{t.quantity}</span>}</div>
                  <div className="tcard__title">{t.title}</div>
                  <div className="tcard__meta">
                    <span className="tchip">{t.responsible_name || 'Sin asignar'}</span>
                    <Due task={t} />
                  </div>
                  {/* En pantallas táctiles no hay arrastrar: se elige el estado acá. */}
                  <select className="field field--select tcard__move" value={t.status} onClick={(e) => e.stopPropagation()} onChange={(e) => onMove(t, e.target.value as TaskStatus)} aria-label={`Estado de ${t.id}`}>
                    {STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </article>
              ))}
              {col.length === 0 && <p className="muted tcol__empty">Soltá una tarea acá</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TaskTable({ tasks, onOpen, showPhase }: { tasks: Task[]; onOpen: (id: string) => void; showPhase?: boolean }) {
  return (
    <div className="glass table-wrap">
      <table className="table">
        <thead><tr><th>Código</th><th>Tarea</th>{showPhase && <th>Fase</th>}<th>Responsable</th><th>Estado</th><th>Fecha límite</th></tr></thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="table__row" onClick={() => onOpen(t.id)}>
              <td><span className="tcode">{t.id}</span></td>
              <td><div className="cell-main">{t.title}</div>{t.quantity > 1 && <div className="cell-sub">×{t.quantity}</div>}</td>
              {showPhase && <td>{t.phase}</td>}
              <td>{t.responsible_name || <span className="muted">Sin asignar</span>}</td>
              <td><StatusPill status={t.status} /></td>
              <td><Due task={t} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ByPhase({ tasks, phases, onOpen }: { tasks: Task[]; phases: TaskPhase[]; onOpen: (id: string) => void }) {
  const groups = phases.map((p) => ({ p, items: tasks.filter((t) => t.phase === p.name).sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true })) })).filter((g) => g.items.length);
  if (!groups.length) return <EmptyState title="Ninguna tarea coincide" text="Probá con otros filtros." />;
  return (
    <div className="stack">
      {groups.map(({ p, items }) => (
        <section key={p.name}>
          <h2 className="section-title section-title--sm">
            {p.name} · {items.filter((t) => t.status === 'Hecha').length}/{items.length} hechas
          </h2>
          <TaskTable tasks={items} onOpen={onOpen} />
        </section>
      ))}
    </div>
  );
}

function Mine({ tasks, profileId, people, onOpen }: { tasks: Task[]; profileId: string | null; people: TaskPerson[]; onOpen: (id: string) => void }) {
  const me = people.find((p) => p.profile_id === profileId);
  const mine = tasks.filter((t) => profileId && t.responsible_id === profileId);
  const byDue = (a: Task, b: Task) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.id.localeCompare(b.id);
  const open = mine.filter((t) => t.status !== 'Hecha').sort(byDue);
  const done = mine.filter((t) => t.status === 'Hecha').sort(byDue);
  if (!me) return <EmptyState title="No sos responsable de tareas" text="Tu usuario no está en la lista de responsables (Mati, Santi, Manu, José)." />;
  if (!mine.length) return <EmptyState title="No tenés tareas asignadas" text={`Cuando te asignen una tarea, ${me.name}, aparece acá ordenada por fecha límite.`} />;
  return (
    <div className="stack">
      <section>
        <h2 className="section-title section-title--sm">Pendientes · {open.length}{open.some((t) => isOverdue(t)) ? ` · ${open.filter((t) => isOverdue(t)).length} vencidas` : ''}</h2>
        {open.length ? <TaskTable tasks={open} onOpen={onOpen} showPhase /> : <p className="muted">Todo hecho. 🎉</p>}
      </section>
      {done.length > 0 && (
        <section>
          <h2 className="section-title section-title--sm">Hechas · {done.length}</h2>
          <TaskTable tasks={done} onOpen={onOpen} showPhase />
        </section>
      )}
    </div>
  );
}

function Summary({ tasks, people, onPick }: { tasks: Task[]; people: TaskPerson[]; onPick: (name: string) => void }) {
  const today = todayISO();
  const rows = [...people.map((p) => ({ key: p.name, label: p.name })), { key: 'none', label: 'Sin asignar' }]
    .map((r) => {
      const mine = tasks.filter((t) => (r.key === 'none' ? !t.responsible_name : t.responsible_name === r.key));
      const n = (s: TaskStatus) => mine.filter((t) => t.status === s).length;
      return { ...r, total: mine.length, done: n('Hecha'), doing: n('En curso'), review: n('En revisión'), todo: n('Por hacer'), blocked: n('Bloqueada'), overdue: mine.filter((t) => isOverdue(t, today)).length };
    })
    .filter((r) => r.total > 0 || r.key !== 'none');
  return (
    <div className="glass table-wrap">
      <table className="table table--num">
        <thead><tr><th>Persona</th><th>Tiene</th><th>Hechas</th><th>Por hacer</th><th>En curso</th><th>En revisión</th><th>Bloqueadas</th><th>Vencidas</th><th>Avance</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="table__row" onClick={() => onPick(r.key)}>
              <td>{r.label}</td>
              <td>{r.total}</td>
              <td>{r.done}</td>
              <td>{r.todo}</td>
              <td>{r.doing}</td>
              <td>{r.review}</td>
              <td>{r.blocked}</td>
              <td className={r.overdue ? 'text-warn' : undefined}>{r.overdue}</td>
              <td>{r.total ? `${Math.round((r.done / r.total) * 100)}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
