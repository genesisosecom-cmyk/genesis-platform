import { supabase, unwrap } from '../../lib/supabase';

export const STATUSES = ['Por hacer', 'En curso', 'En revisión', 'Hecha', 'Bloqueada'] as const;
export type TaskStatus = (typeof STATUSES)[number];

/** Clase de color de cada estado (ver .tstatus--* en styles.css). */
export const STATUS_CLASS: Record<TaskStatus, string> = {
  'Por hacer': 'todo',
  'En curso': 'doing',
  'En revisión': 'review',
  Hecha: 'done',
  Bloqueada: 'blocked',
};

export interface Task {
  id: string;
  title: string;
  phase: string;
  quantity: number;
  status: TaskStatus;
  responsible_id: string | null;
  responsible_name: string;
  due_date: string | null;
  agent: string;
  reference: string;
  link: string;
  notes: string;
  created_by_name: string;
  created_at: string;
  updated_by_name: string;
  updated_at: string;
  version: number;
}

export interface TaskPerson {
  name: string;
  profile_id: string | null;
  sort: number;
  active: boolean;
}

export interface TaskPhase {
  name: string;
  prefix: string;
  offset_days: number | null;
  sort: number;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface TaskEvent {
  id: string;
  task_id: string;
  author_name: string;
  what: string;
  created_at: string;
}

/** Campos editables desde la ficha. */
export type TaskFields = Pick<Task, 'title' | 'phase' | 'quantity' | 'status' | 'responsible_name' | 'due_date' | 'agent' | 'reference' | 'link' | 'notes'>;
export const EDITABLE: (keyof TaskFields)[] = ['title', 'phase', 'quantity', 'status', 'responsible_name', 'due_date', 'agent', 'reference', 'link', 'notes'];

export interface Conflict {
  field: keyof TaskFields;
  current: unknown;
  by: string | null;
  at: string | null;
}

export const fetchTasks = async () => unwrap(await supabase.from('tasks').select('*').order('id')) as Task[];
export const fetchPeople = async () => unwrap(await supabase.from('task_people').select('*').order('sort')) as TaskPerson[];
export const fetchPhases = async () => unwrap(await supabase.from('task_phases').select('*').order('sort')) as TaskPhase[];

export const fetchTaskDetail = async (id: string) => {
  const [comments, events] = await Promise.all([
    supabase.from('task_comments').select('*').eq('task_id', id).order('created_at'),
    supabase.from('task_events').select('*').eq('task_id', id).order('created_at', { ascending: false }),
  ]);
  return { comments: unwrap(comments) as TaskComment[], events: unwrap(events) as TaskEvent[] };
};

async function rpc<T = void>(fn: string, args: Record<string, unknown>) {
  return unwrap(await supabase.rpc(fn, args)) as T;
}

export const createTask = (fields: Partial<TaskFields>) => rpc<string>('task_create', { p: fields });

/**
 * Guarda solo los campos cambiados. `expected` es el valor que tenía cada uno al abrir la ficha:
 * si otro lo cambió mientras tanto, ese campo vuelve en `conflicts` y no se pisa.
 */
export const updateTask = (id: string, changes: Partial<TaskFields>, expected: Partial<TaskFields>) =>
  rpc<{ ok: boolean; applied: number; conflicts: Conflict[]; task: Task }>('task_update', { p_id: id, p_changes: changes, p_expected: expected });

export const commentTask = (id: string, body: string) => rpc('task_comment', { p_id: id, p_body: body });
export const deleteTask = (id: string) => rpc('task_delete', { p_id: id });

/** Escucha los cambios de otros en tiempo real. Devuelve la función para dejar de escuchar. */
export function subscribeTasks(onChange: () => void) {
  const channel = supabase
    .channel('tasks-board')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments' }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_events' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const isOverdue = (t: Task, today = todayISO()) => Boolean(t.due_date && t.due_date < today && t.status !== 'Hecha');
