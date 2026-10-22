import { useState, type FormEvent } from 'react';
import { useAsync } from '../lib/useAsync';
import { supabase } from '../lib/supabase';
import { fetchModules } from '../content/api';
import { useContent } from '../content/ContentContext';
import { formatMinutes, moduleDuration, type Lesson, type Module } from '../data/content';
import VideoPlayer from '../components/VideoPlayer';
import { Field, Modal, Pill, State } from './ui';

type Editing =
  | { kind: 'module'; module: Module | null }
  | { kind: 'lesson'; module: Module; lesson: Lesson | null };

/** Reasigna posiciones 1..n en el orden dado (solo actualiza las filas que cambian). */
async function persistOrder(table: 'modules' | 'lessons', ids: string[]) {
  await Promise.all(ids.map((id, i) => supabase.from(table).update({ position: i + 1 }).eq('id', id)));
}

function moved<T>(list: T[], i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= list.length) return null;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export default function ContentAdminPage() {
  const { data, loading, error, reload } = useAsync(fetchModules, []);
  const content = useContent();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  const modules = data ?? [];

  const refresh = () => {
    reload();
    content.reload();
  };

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null } | void>) => {
    const res = await fn();
    if (res && res.error) setMsg(res.error.message);
    else setMsg('');
    refresh();
  };

  const moveModule = (i: number, d: number) => {
    const next = moved(modules, i, d);
    if (next) run(() => persistOrder('modules', next.map((m) => m.id)));
  };
  const moveLesson = (m: Module, i: number, d: number) => {
    const next = moved(m.lessons, i, d);
    if (next) run(() => persistOrder('lessons', next.map((l) => l.id)));
  };

  const removeModule = (m: Module) => {
    if (!window.confirm(`¿Eliminar el módulo "${m.title}" y sus ${m.lessons.length} lecciones? No se puede deshacer.`)) return;
    run(() => supabase.from('modules').delete().eq('id', m.id));
  };
  const removeLesson = (l: Lesson) => {
    if (!window.confirm(`¿Eliminar la lección "${l.title}"? No se puede deshacer.`)) return;
    run(() => supabase.from('lessons').delete().eq('id', l.id));
  };

  return (
    <>
      <div className="toolbar">
        <p className="muted">
          Los videos se suben a YouTube (no listado), Vimeo, Loom o Bunny y se pega el link en cada lección. Lo que está en borrador no lo ven los alumnos.
        </p>
        <button className="btn btn--primary" onClick={() => setEditing({ kind: 'module', module: null })}>+ Nuevo módulo</button>
      </div>
      {msg && <p className="login__error">{msg}</p>}

      <State loading={loading} error={error} empty={!modules.length}>
        <div className="cms">
          {modules.map((m, i) => {
            const isOpen = open[m.id] ?? i === 0;
            const withoutVideo = m.lessons.filter((l) => !l.videoUrl).length;
            return (
              <section key={m.id} className="glass cms__module">
                <header className="cms__head">
                  <button className="cms__toggle" onClick={() => setOpen((o) => ({ ...o, [m.id]: !isOpen }))} aria-expanded={isOpen}>
                    <span className="cms__num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="cms__title">
                      <strong>{m.title}</strong>
                      <span className="muted">
                        {m.lessons.length} lecciones · {formatMinutes(moduleDuration(m))}
                        {withoutVideo > 0 && ` · ${withoutVideo} sin video`}
                      </span>
                    </span>
                    <span className="cms__chev">{isOpen ? '▾' : '▸'}</span>
                  </button>
                  <div className="cms__actions">
                    {m.published ? <Pill tone="ok">Publicado</Pill> : <Pill tone="muted">Borrador</Pill>}
                    <button className="btn btn--ghost btn--sm" onClick={() => moveModule(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => moveModule(i, 1)} disabled={i === modules.length - 1} aria-label="Bajar">↓</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => setEditing({ kind: 'module', module: m })}>Editar</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => run(() => supabase.from('modules').update({ published: !m.published }).eq('id', m.id))}>
                      {m.published ? 'Ocultar' : 'Publicar'}
                    </button>
                    <button className="btn btn--ghost btn--sm btn--danger" onClick={() => removeModule(m)} aria-label="Eliminar módulo">✕</button>
                  </div>
                </header>

                {isOpen && (
                  <div className="cms__lessons">
                    {m.lessons.length === 0 && <p className="muted">Este módulo todavía no tiene lecciones.</p>}
                    {m.lessons.map((l, j) => (
                      <div key={l.id} className="cms__lesson">
                        <span className="cms__lnum">{j + 1}</span>
                        <div className="cms__ltitle">
                          <span>{l.title}</span>
                          <span className="cell-sub">
                            {l.videoUrl ? 'Con video' : <span className="plan__warn">Sin video</span>} · {l.duration} min
                          </span>
                        </div>
                        <div className="cms__actions">
                          {l.published ? <Pill tone="ok">Publicada</Pill> : <Pill tone="muted">Borrador</Pill>}
                          <button className="btn btn--ghost btn--sm" onClick={() => moveLesson(m, j, -1)} disabled={j === 0} aria-label="Subir">↑</button>
                          <button className="btn btn--ghost btn--sm" onClick={() => moveLesson(m, j, 1)} disabled={j === m.lessons.length - 1} aria-label="Bajar">↓</button>
                          <button className="btn btn--ghost btn--sm" onClick={() => setEditing({ kind: 'lesson', module: m, lesson: l })}>Editar</button>
                          <button className="btn btn--ghost btn--sm" onClick={() => run(() => supabase.from('lessons').update({ published: !l.published }).eq('id', l.id))}>
                            {l.published ? 'Ocultar' : 'Publicar'}
                          </button>
                          <button className="btn btn--ghost btn--sm btn--danger" onClick={() => removeLesson(l)} aria-label="Eliminar lección">✕</button>
                        </div>
                      </div>
                    ))}
                    <button className="btn btn--ghost btn--sm cms__add" onClick={() => setEditing({ kind: 'lesson', module: m, lesson: null })}>+ Agregar lección</button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </State>

      {editing?.kind === 'module' && (
        <ModuleModal
          module={editing.module}
          nextPosition={modules.length + 1}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            setOpen((o) => ({ ...o, [id]: true }));
            refresh();
          }}
        />
      )}
      {editing?.kind === 'lesson' && (
        <LessonModal
          module={editing.module}
          lesson={editing.lesson}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function ModuleModal({ module, nextPosition, onClose, onSaved }: { module: Module | null; nextPosition: number; onClose: () => void; onSaved: (id: string) => void }) {
  const [title, setTitle] = useState(module?.title ?? '');
  const [subtitle, setSubtitle] = useState(module?.subtitle ?? '');
  const [published, setPublished] = useState(module?.published ?? false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('El módulo necesita un título');
    setSaving(true);
    const payload = { title: title.trim(), subtitle: subtitle.trim() || null, published };
    const res = module
      ? await supabase.from('modules').update(payload).eq('id', module.id).select('id').single()
      : await supabase.from('modules').insert({ ...payload, position: nextPosition }).select('id').single();
    setSaving(false);
    if (res.error) return setError(res.error.message);
    onSaved((res.data as { id: string }).id);
  };

  return (
    <Modal title={module ? 'Editar módulo' : 'Nuevo módulo'} onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Título" full><input className="field" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
        <Field label="Bajada (una línea)" full><input className="field" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Ej: Construí una oferta que se venda sola." /></Field>
        <label className="check afield--full">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Publicado (visible para los alumnos)
        </label>
        {!module && <p className="muted aform__note afield--full">Tip: crealo como borrador, cargale las lecciones y publicalo cuando esté listo.</p>}
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}

function LessonModal({ module, lesson, onClose, onSaved }: { module: Module; lesson: Lesson | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [description, setDescription] = useState(lesson?.description ?? '');
  const [videoUrl, setVideoUrl] = useState(lesson?.videoUrl ?? '');
  const [duration, setDuration] = useState(String(lesson?.duration ?? ''));
  const [published, setPublished] = useState(lesson?.published ?? true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const validUrl = !videoUrl.trim() || /^https?:\/\/\S+$/.test(videoUrl.trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('La lección necesita un título');
    if (!validUrl) return setError('El link del video tiene que empezar con https://');
    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      video_url: videoUrl.trim() || null,
      duration_min: Math.max(0, Math.round(Number(duration) || 0)),
      published,
    };
    const { error: err } = lesson
      ? await supabase.from('lessons').update(payload).eq('id', lesson.id)
      : await supabase.from('lessons').insert({ ...payload, module_id: module.id, position: module.lessons.length + 1 });
    setSaving(false);
    if (err) return setError(err.message);
    onSaved();
  };

  return (
    <Modal title={`${lesson ? 'Editar' : 'Nueva'} lección · ${module.title}`} onClose={onClose} wide>
      <form className="aform" onSubmit={submit}>
        <Field label="Título" full><input className="field" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
        <Field label="Link del video" full>
          <input className="field" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtu.be/… · https://vimeo.com/… · https://www.loom.com/share/…" />
        </Field>
        {videoUrl.trim() && validUrl && (
          <div className="afield--full cms__preview">
            <VideoPlayer url={videoUrl.trim()} title={title || 'Vista previa'} />
          </div>
        )}
        <Field label="Duración (minutos)"><input className="field" type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
        <label className="check" style={{ alignSelf: 'end', paddingBottom: 12 }}>
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Publicada
        </label>
        <Field label="Descripción (se muestra debajo del video)" full>
          <textarea className="field field--area" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
