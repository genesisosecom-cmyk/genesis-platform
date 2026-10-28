import { useState, type FormEvent } from 'react';
import { useAsync } from '../lib/useAsync';
import { supabase } from '../lib/supabase';
import { fetchModules } from '../content/api';
import { useContent } from '../content/ContentContext';
import { formatMinutes, moduleDuration, type Lesson, type Module, type ModuleSection } from '../data/content';
import { removeFiles } from '../content/files';
import ResourcesEditor, { draftsFrom, saveResources, validateResources, type DraftResource } from './ResourcesEditor';
import VideoPlayer from '../components/VideoPlayer';
import { Field, Modal, Pill, State } from './ui';

type Editing =
  | { kind: 'module'; module: Module | null }
  | { kind: 'lesson'; module: Module; lesson: Lesson | null; sectionId: string | null };

/** Reasigna posiciones 1..n en el orden dado (solo actualiza las filas que cambian). */
async function persistOrder(table: 'modules' | 'lessons' | 'module_sections', ids: string[]) {
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
  // Las lecciones se ordenan dentro de su sección.
  const moveLesson = (group: Lesson[], i: number, d: number) => {
    const next = moved(group, i, d);
    if (next) run(() => persistOrder('lessons', next.map((l) => l.id)));
  };
  const moveSection = (m: Module, i: number, d: number) => {
    const next = moved(m.sections, i, d);
    if (next) run(() => persistOrder('module_sections', next.map((x) => x.id)));
  };
  const addSection = (m: Module) => {
    const title = window.prompt('Nombre de la sección (ej: Búsqueda y validación de producto):')?.trim();
    if (title) run(() => supabase.from('module_sections').insert({ module_id: m.id, title, position: m.sections.length + 1 }));
  };
  const renameSection = (x: ModuleSection) => {
    const title = window.prompt('Nuevo nombre de la sección:', x.title)?.trim();
    if (title && title !== x.title) run(() => supabase.from('module_sections').update({ title }).eq('id', x.id));
  };
  const removeSection = (m: Module, x: ModuleSection) => {
    const n = m.lessons.filter((l) => l.sectionId === x.id).length;
    if (!window.confirm(`¿Eliminar la sección "${x.title}"?${n ? ` Sus ${n} clases no se borran: quedan sin sección.` : ''}`)) return;
    run(() => supabase.from('module_sections').delete().eq('id', x.id));
  };

  const removeModule = (m: Module) => {
    if (!window.confirm(`¿Eliminar el módulo "${m.title}" y sus ${m.lessons.length} lecciones? No se puede deshacer.`)) return;
    run(async () => {
      const res = await supabase.from('modules').delete().eq('id', m.id);
      // Los recursos se borran en cascada; sus archivos hay que quitarlos del almacenamiento.
      if (!res.error) await removeFiles(m.lessons.flatMap((l) => l.resources.map((r) => r.filePath)));
      return res;
    });
  };
  const removeLesson = (l: Lesson) => {
    if (!window.confirm(`¿Eliminar la lección "${l.title}"? No se puede deshacer.`)) return;
    run(async () => {
      const res = await supabase.from('lessons').delete().eq('id', l.id);
      if (!res.error) await removeFiles(l.resources.map((r) => r.filePath));
      return res;
    });
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
                    {m.lessons.length === 0 && m.sections.length === 0 && <p className="muted">Este módulo todavía no tiene lecciones.</p>}
                    {[{ section: null as ModuleSection | null }, ...m.sections.map((x) => ({ section: x as ModuleSection | null }))].map(({ section }, si) => {
                      const group = m.lessons.filter((l) => (section ? l.sectionId === section.id : !l.sectionId));
                      // El grupo "sin sección" solo se muestra si tiene clases o si el módulo no usa secciones.
                      if (!section && !group.length && m.sections.length) return null;
                      return (
                        <div key={section?.id ?? 'none'} className={`cms__group${section ? ' cms__group--section' : ''}`}>
                          {section && (
                            <div className="cms__section">
                              <span className="cms__section-title">{section.title}</span>
                              <span className="muted cms__section-count">{group.length} {group.length === 1 ? 'clase' : 'clases'}</span>
                              <div className="cms__actions">
                                <button className="btn btn--ghost btn--sm" onClick={() => moveSection(m, si - 1, -1)} disabled={si === 1} aria-label="Subir sección">↑</button>
                                <button className="btn btn--ghost btn--sm" onClick={() => moveSection(m, si - 1, 1)} disabled={si === m.sections.length} aria-label="Bajar sección">↓</button>
                                <button className="btn btn--ghost btn--sm" onClick={() => renameSection(section)}>Renombrar</button>
                                <button className="btn btn--ghost btn--sm btn--danger" onClick={() => removeSection(m, section)} aria-label="Eliminar sección">✕</button>
                              </div>
                            </div>
                          )}
                          {!section && m.sections.length > 0 && <span className="cms__section-title cms__section-title--none">Sin sección</span>}
                          {group.map((l, j) => (
                            <div key={l.id} className="cms__lesson">
                              <span className="cms__lnum">{m.lessons.indexOf(l) + 1}</span>
                              <div className="cms__ltitle">
                                <span>{l.title}</span>
                                <span className="cell-sub">
                                  {l.videoUrl ? 'Con video' : <span className="plan__warn">Sin video</span>} · {l.duration} min
                                  {l.resources.length > 0 && ` · ${l.resources.length} ${l.resources.length === 1 ? 'recurso' : 'recursos'}`}
                                </span>
                              </div>
                              <div className="cms__actions">
                                {l.published ? <Pill tone="ok">Publicada</Pill> : <Pill tone="muted">Borrador</Pill>}
                                <button className="btn btn--ghost btn--sm" onClick={() => moveLesson(group, j, -1)} disabled={j === 0} aria-label="Subir">↑</button>
                                <button className="btn btn--ghost btn--sm" onClick={() => moveLesson(group, j, 1)} disabled={j === group.length - 1} aria-label="Bajar">↓</button>
                                <button className="btn btn--ghost btn--sm" onClick={() => setEditing({ kind: 'lesson', module: m, lesson: l, sectionId: l.sectionId })}>Editar</button>
                                <button className="btn btn--ghost btn--sm" onClick={() => run(() => supabase.from('lessons').update({ published: !l.published }).eq('id', l.id))}>
                                  {l.published ? 'Ocultar' : 'Publicar'}
                                </button>
                                <button className="btn btn--ghost btn--sm btn--danger" onClick={() => removeLesson(l)} aria-label="Eliminar lección">✕</button>
                              </div>
                            </div>
                          ))}
                          <button className="btn btn--ghost btn--sm cms__add" onClick={() => setEditing({ kind: 'lesson', module: m, lesson: null, sectionId: section?.id ?? null })}>
                            + Agregar clase{section ? ` a "${section.title}"` : ''}
                          </button>
                        </div>
                      );
                    })}
                    <button className="btn btn--ghost btn--sm cms__add cms__add--section" onClick={() => addSection(m)}>+ Nueva sección</button>
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
          defaultSectionId={editing.sectionId}
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

function LessonModal({ module, lesson, defaultSectionId, onClose, onSaved }: { module: Module; lesson: Lesson | null; defaultSectionId: string | null; onClose: () => void; onSaved: () => void }) {
  const [sectionId, setSectionId] = useState<string>(lesson?.sectionId ?? defaultSectionId ?? '');
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [description, setDescription] = useState(lesson?.description ?? '');
  const [videoUrl, setVideoUrl] = useState(lesson?.videoUrl ?? '');
  const [duration, setDuration] = useState(String(lesson?.duration ?? ''));
  const [published, setPublished] = useState(lesson?.published ?? true);
  const [resources, setResources] = useState<DraftResource[]>(() => draftsFrom(lesson?.resources ?? []));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | false>(false);

  const validUrl = !videoUrl.trim() || /^https?:\/\/\S+$/.test(videoUrl.trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('La lección necesita un título');
    if (!validUrl) return setError('El link del video tiene que empezar con https://');
    const resourcesError = validateResources(resources);
    if (resourcesError) return setError(resourcesError);
    setError('');
    setSaving('Guardando…');
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      video_url: videoUrl.trim() || null,
      duration_min: Math.max(0, Math.round(Number(duration) || 0)),
      published,
      section_id: sectionId || null,
    };
    // Al crearla o cambiarla de sección, queda última dentro de su sección.
    const endOfSection = module.lessons.filter((l) => (l.sectionId ?? '') === sectionId && l.id !== lesson?.id).length + 1;
    const movedSection = !lesson || (lesson.sectionId ?? '') !== sectionId;
    const res = lesson
      ? await supabase.from('lessons').update({ ...payload, ...(movedSection ? { position: endOfSection } : {}) }).eq('id', lesson.id).select('id').single()
      : await supabase.from('lessons').insert({ ...payload, module_id: module.id, position: endOfSection }).select('id').single();
    if (res.error) {
      setSaving(false);
      return setError(res.error.message);
    }
    try {
      await saveResources((res.data as { id: string }).id, lesson?.resources ?? [], resources, setSaving);
    } catch (err) {
      setSaving(false);
      return setError(`La lección se guardó, pero hubo un problema con los recursos: ${(err as Error).message}`);
    }
    onSaved();
  };

  return (
    <Modal title={`${lesson ? 'Editar' : 'Nueva'} lección · ${module.title}`} onClose={onClose} wide>
      <form className="aform" onSubmit={submit}>
        <Field label="Título" full><input className="field" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
        {module.sections.length > 0 && (
          <Field label="Sección" full>
            <select className="field field--select" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Sin sección</option>
              {module.sections.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
          </Field>
        )}
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
        <div className="afield--full">
          <span className="afield__label form-section">Recursos de la clase</span>
          <ResourcesEditor value={resources} onChange={setResources} />
        </div>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          {saving && <span className="muted" style={{ marginRight: 'auto' }}>{saving}</span>}
          <button className="btn btn--primary" disabled={!!saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
