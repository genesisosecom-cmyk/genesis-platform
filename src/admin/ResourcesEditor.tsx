import { supabase } from '../lib/supabase';
import type { LessonResource } from '../data/content';
import { fileSize, MAX_FILE_MB, removeFiles, tooBig, uploadFile } from '../content/files';

/** Recurso en edición: puede ser uno existente (con id) o uno nuevo. */
export interface DraftResource {
  key: string;
  id?: string;
  title: string;
  description: string;
  kind: 'file' | 'link';
  url: string;
  /** Archivo nuevo elegido (se sube al guardar). */
  file: File | null;
  /** Archivo ya subido. */
  filePath: string | null;
  fileName: string | null;
}

export const draftsFrom = (list: LessonResource[]): DraftResource[] =>
  list.map((r) => ({
    key: r.id,
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    kind: r.filePath ? 'file' : 'link',
    url: r.url ?? '',
    file: null,
    filePath: r.filePath,
    fileName: r.fileName,
  }));

const isUrl = (v: string) => /^https?:\/\/\S+$/.test(v.trim());

export function validateResources(list: DraftResource[]) {
  for (const [i, r] of list.entries()) {
    const n = `Recurso ${i + 1}`;
    if (!r.title.trim()) return `${n}: falta el título`;
    if (r.kind === 'file' && !r.file && !r.filePath) return `${n}: elegí un archivo`;
    if (r.kind === 'link' && !isUrl(r.url)) return `${n}: el link tiene que empezar con https://`;
  }
  return '';
}

/**
 * Sincroniza los recursos de una lección: sube archivos nuevos, guarda filas,
 * elimina las quitadas y borra del almacenamiento los archivos que ya no se usan.
 */
export async function saveResources(lessonId: string, before: LessonResource[], drafts: DraftResource[], progress: (msg: string) => void) {
  const keptIds = new Set(drafts.filter((d) => d.id).map((d) => d.id));
  const removed = before.filter((r) => !keptIds.has(r.id));
  const orphanFiles: (string | null)[] = removed.map((r) => r.filePath);

  const rows = [];
  for (const [i, d] of drafts.entries()) {
    let filePath = d.kind === 'file' ? d.filePath : null;
    let fileName = d.kind === 'file' ? d.fileName : null;
    if (d.kind === 'file' && d.file) {
      progress(`Subiendo ${d.file.name}…`);
      filePath = await uploadFile(d.file, 'lessons/');
      fileName = d.file.name;
    }
    const previous = before.find((r) => r.id === d.id);
    if (previous?.filePath && previous.filePath !== filePath) orphanFiles.push(previous.filePath);
    rows.push({
      ...(d.id ? { id: d.id } : {}),
      lesson_id: lessonId,
      position: i + 1,
      title: d.title.trim(),
      description: d.description.trim() || null,
      url: d.kind === 'link' ? d.url.trim() : null,
      file_path: filePath,
      file_name: fileName,
    });
  }

  progress('Guardando recursos…');
  if (removed.length) {
    const { error } = await supabase.from('lesson_resources').delete().in('id', removed.map((r) => r.id));
    if (error) throw new Error(error.message);
  }
  const existing = rows.filter((r) => 'id' in r);
  const fresh = rows.filter((r) => !('id' in r));
  if (existing.length) {
    const { error } = await supabase.from('lesson_resources').upsert(existing);
    if (error) throw new Error(error.message);
  }
  if (fresh.length) {
    const { error } = await supabase.from('lesson_resources').insert(fresh);
    if (error) throw new Error(error.message);
  }
  await removeFiles(orphanFiles);
}

export default function ResourcesEditor({ value, onChange }: { value: DraftResource[]; onChange: (v: DraftResource[]) => void }) {
  const set = (i: number, patch: Partial<DraftResource>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = (kind: DraftResource['kind']) =>
    onChange([...value, { key: crypto.randomUUID(), title: '', description: '', kind, url: '', file: null, filePath: null, fileName: null }]);

  const pick = (i: number, f: File | null) => {
    if (f && tooBig(f)) {
      window.alert(`"${f.name}" pesa ${fileSize(f.size)}. El máximo es ${MAX_FILE_MB} MB: subilo a Google Drive y agregalo como link.`);
      return;
    }
    set(i, { file: f, title: value[i].title || (f ? f.name.replace(/\.[^.]+$/, '') : '') });
  };

  return (
    <div className="res-editor">
      {value.length === 0 && <p className="muted res-editor__empty">Sin recursos. Agregá documentos descargables (PDF, .docx, .md…) o links (Google Docs, Drive, Notion…).</p>}
      {value.map((r, i) => (
        <div key={r.key} className="res-editor__item">
          <div className="res-editor__row">
            <span className="res-editor__n">{String(i + 1).padStart(2, '0')}</span>
            <input className="field" placeholder="Título · ej: Documento de la clase (.docx)" value={r.title} onChange={(e) => set(i, { title: e.target.value })} />
            <div className="role-pick">
              <button type="button" className={`chip chip--sm${r.kind === 'file' ? ' is-active' : ''}`} onClick={() => set(i, { kind: 'file' })}>📎 Archivo</button>
              <button type="button" className={`chip chip--sm${r.kind === 'link' ? ' is-active' : ''}`} onClick={() => set(i, { kind: 'link' })}>🔗 Link</button>
            </div>
          </div>
          <div className="res-editor__row res-editor__row--indent">
            {r.kind === 'file' ? (
              <label className={`dropzone dropzone--sm${r.file || r.filePath ? ' has-file' : ''}`}>
                <input type="file" onChange={(e) => pick(i, e.target.files?.[0] ?? null)} />
                {r.file ? (
                  <span><strong>{r.file.name}</strong> · {fileSize(r.file.size)} — se sube al guardar</span>
                ) : r.filePath ? (
                  <span><strong>{r.fileName}</strong> · elegí otro para reemplazarlo</span>
                ) : (
                  <span>Elegir archivo <span className="muted">(máx. {MAX_FILE_MB} MB)</span></span>
                )}
              </label>
            ) : (
              <input className="field" placeholder="https://docs.google.com/…" value={r.url} onChange={(e) => set(i, { url: e.target.value })} />
            )}
          </div>
          <div className="res-editor__row res-editor__row--indent">
            <input className="field" placeholder="Descripción corta (opcional) · ej: la versión viva del documento" value={r.description} onChange={(e) => set(i, { description: e.target.value })} />
            <div className="res-editor__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="Bajar">↓</button>
              <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Quitar recurso">✕</button>
            </div>
          </div>
        </div>
      ))}
      <div className="res-editor__add">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => add('file')}>+ Archivo</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => add('link')}>+ Link</button>
      </div>
    </div>
  );
}
