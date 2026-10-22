import { useRef, useState, type FormEvent } from 'react';
import { useAsync } from '../lib/useAsync';
import { supabase } from '../lib/supabase';
import { fetchTools, toolFileUrl, TOOLBOX_BUCKET } from '../content/api';
import { useContent } from '../content/ContentContext';
import { TOOL_TYPES, type Tool } from '../data/content';
import { Field, Modal, Pill, State } from './ui';

const MAX_FILE_MB = 50; // límite por archivo del plan free de Supabase

const fileSize = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

/** Nombre de archivo seguro para la ruta en Storage (sin acentos ni espacios). */
const safeName = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'archivo';

export default function ToolsAdminPage() {
  const { data, loading, error, reload } = useAsync(fetchTools, []);
  const content = useContent();
  const [editing, setEditing] = useState<Tool | 'new' | null>(null);
  const [msg, setMsg] = useState('');
  const tools = data ?? [];

  const refresh = () => {
    reload();
    content.reload();
  };

  const move = async (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= tools.length) return;
    const next = [...tools];
    [next[i], next[j]] = [next[j], next[i]];
    await Promise.all(next.map((t, k) => supabase.from('tools').update({ position: k + 1 }).eq('id', t.id)));
    refresh();
  };

  const togglePublish = async (t: Tool) => {
    if (!t.published && !t.url && !t.filePath) return setMsg(`"${t.name}" necesita un archivo o un link antes de publicarse.`);
    const { error: err } = await supabase.from('tools').update({ published: !t.published }).eq('id', t.id);
    setMsg(err ? err.message : '');
    refresh();
  };

  const remove = async (t: Tool) => {
    if (!window.confirm(`¿Eliminar "${t.name}"${t.filePath ? ' y su archivo' : ''}? No se puede deshacer.`)) return;
    const { error: err } = await supabase.from('tools').delete().eq('id', t.id);
    if (err) return setMsg(err.message);
    if (t.filePath) await supabase.storage.from(TOOLBOX_BUCKET).remove([t.filePath]);
    setMsg('');
    refresh();
  };

  const preview = async (t: Tool) => {
    if (t.filePath) window.open(await toolFileUrl(t.filePath), '_blank');
    else if (t.url) window.open(t.url, '_blank', 'noopener');
  };

  return (
    <>
      <div className="toolbar">
        <p className="muted">Subí archivos (PDF, planillas, plantillas… hasta {MAX_FILE_MB} MB) o pegá un link. Solo los ven los miembros logueados.</p>
        <button className="btn btn--primary" onClick={() => setEditing('new')}>+ Nueva herramienta</button>
      </div>
      {msg && <p className="login__error">{msg}</p>}

      <State loading={loading} error={error} empty={!tools.length}>
        <div className="glass table-wrap">
          <table className="table">
            <thead>
              <tr><th>Herramienta</th><th>Categoría</th><th>Contenido</th><th>Estado</th><th /></tr>
            </thead>
            <tbody>
              {tools.map((t, i) => (
                <tr key={t.id}>
                  <td>
                    <div className="cell-main">{t.name} <Pill tone="muted">{t.type}</Pill></div>
                    <div className="cell-sub">{t.description || '—'}</div>
                  </td>
                  <td>{t.category}</td>
                  <td>
                    {t.filePath ? (
                      <button className="link link--btn" onClick={() => preview(t)}>📎 {t.fileName ?? 'Archivo'}</button>
                    ) : t.url ? (
                      <button className="link link--btn" onClick={() => preview(t)}>🔗 Link</button>
                    ) : (
                      <span className="plan__warn">Sin archivo ni link</span>
                    )}
                  </td>
                  <td>{t.published ? <Pill tone="ok">Publicada</Pill> : <Pill tone="muted">Borrador</Pill>}</td>
                  <td className="cell-actions">
                    <button className="btn btn--ghost btn--sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => move(i, 1)} disabled={i === tools.length - 1} aria-label="Bajar">↓</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => setEditing(t)}>Editar</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => togglePublish(t)}>{t.published ? 'Ocultar' : 'Publicar'}</button>
                    <button className="btn btn--ghost btn--sm btn--danger" onClick={() => remove(t)} aria-label="Eliminar">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </State>

      {editing && (
        <ToolModal
          tool={editing === 'new' ? null : editing}
          categories={[...new Set(tools.map((t) => t.category))]}
          nextPosition={tools.length + 1}
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

function ToolModal({ tool, categories, nextPosition, onClose, onSaved }: { tool: Tool | null; categories: string[]; nextPosition: number; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(tool?.name ?? '');
  const [description, setDescription] = useState(tool?.description ?? '');
  const [category, setCategory] = useState(tool?.category ?? '');
  const [type, setType] = useState(tool?.type ?? 'Plantilla');
  const [source, setSource] = useState<'file' | 'link'>(tool?.url && !tool.filePath ? 'link' : 'file');
  const [url, setUrl] = useState(tool?.url ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [published, setPublished] = useState(tool?.published ?? true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | null) => {
    setError('');
    if (f && f.size > MAX_FILE_MB * 1024 * 1024) {
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      return setError(`El archivo pesa ${fileSize(f.size)}. El máximo es ${MAX_FILE_MB} MB: subilo a Google Drive y pegá el link.`);
    }
    setFile(f);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('La herramienta necesita un nombre');
    const hasFile = source === 'file' && (file || tool?.filePath);
    const hasLink = source === 'link' && /^https?:\/\/\S+$/.test(url.trim());
    if (source === 'link' && url.trim() && !hasLink) return setError('El link tiene que empezar con https://');
    if (published && !hasFile && !hasLink) return setError('Para publicarla subí un archivo o pegá un link (o guardala como borrador).');

    setError('');
    let filePath = source === 'file' ? tool?.filePath ?? null : null;
    let fileName = source === 'file' ? tool?.fileName ?? null : null;

    if (source === 'file' && file) {
      setStatus(`Subiendo ${file.name}…`);
      const path = `${crypto.randomUUID()}/${safeName(file.name)}`;
      const { error: upErr } = await supabase.storage.from(TOOLBOX_BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (upErr) {
        setStatus('');
        return setError(`No se pudo subir el archivo: ${upErr.message}`);
      }
      filePath = path;
      fileName = file.name;
    }

    setStatus('Guardando…');
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      category: category.trim() || 'General',
      type,
      url: source === 'link' ? url.trim() || null : null,
      file_path: filePath,
      file_name: fileName,
      published,
    };
    const { error: err } = tool
      ? await supabase.from('tools').update(payload).eq('id', tool.id)
      : await supabase.from('tools').insert({ ...payload, position: nextPosition });
    if (err) {
      setStatus('');
      // Si falló el guardado, no dejamos el archivo nuevo huérfano.
      if (file && filePath && filePath !== tool?.filePath) await supabase.storage.from(TOOLBOX_BUCKET).remove([filePath]);
      return setError(err.message);
    }
    // Archivo anterior reemplazado o pasado a link: se borra del almacenamiento.
    if (tool?.filePath && tool.filePath !== filePath) await supabase.storage.from(TOOLBOX_BUCKET).remove([tool.filePath]);
    onSaved();
  };

  return (
    <Modal title={tool ? 'Editar herramienta' : 'Nueva herramienta'} onClose={onClose} wide>
      <form className="aform" onSubmit={submit}>
        <Field label="Nombre"><input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Categoría">
          <input className="field" list="tool-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ej: Oferta, Ventas, Operación…" />
          <datalist id="tool-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Descripción" full><input className="field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Para qué sirve, en una línea" /></Field>
        <Field label="Tipo" full>
          <div className="role-pick">
            {TOOL_TYPES.map((t) => (
              <button key={t} type="button" className={`chip${type === t ? ' is-active' : ''}`} onClick={() => setType(t)}>{t}</button>
            ))}
          </div>
        </Field>

        <Field label="Contenido" full>
          <div className="role-pick">
            <button type="button" className={`chip${source === 'file' ? ' is-active' : ''}`} onClick={() => setSource('file')}>📎 Subir archivo</button>
            <button type="button" className={`chip${source === 'link' ? ' is-active' : ''}`} onClick={() => setSource('link')}>🔗 Pegar link</button>
          </div>
        </Field>

        {source === 'file' ? (
          <div className="afield--full">
            <label className={`dropzone${file ? ' has-file' : ''}`}>
              <input ref={fileInput} type="file" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              {file ? (
                <span><strong>{file.name}</strong> · {fileSize(file.size)} — se sube al guardar</span>
              ) : tool?.filePath ? (
                <span>Archivo actual: <strong>{tool.fileName}</strong>. Elegí otro para reemplazarlo.</span>
              ) : (
                <span>Hacé clic para elegir un archivo <span className="muted">(máx. {MAX_FILE_MB} MB)</span></span>
              )}
            </label>
          </div>
        ) : (
          <Field label="Link" full>
            <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/… · https://notion.so/…" />
          </Field>
        )}

        <label className="check afield--full">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Publicada (visible en el baúl)
        </label>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          {status && <span className="muted" style={{ marginRight: 'auto' }}>{status}</span>}
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={!!status}>{status ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
