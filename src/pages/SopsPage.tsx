import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { supabase, unwrap } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { fmtDate } from '../lib/format';
import type { Sop } from '../lib/types';
import { Field, Modal, Pill, State } from '../admin/ui';
import { ArrowRight } from '../components/Icons';

const fetchSops = async () =>
  unwrap(await supabase.from('sops').select('*').order('area').order('position').order('title')) as Sop[];

const AREAS = ['Ventas', 'Onboarding', 'Alumnos', 'Contenido', 'Operaciones', 'Finanzas', 'General'];

/** Los SOPs del negocio. Lo ve el equipo; el admin además los crea y edita. `embedded` = dentro del panel admin. */
export default function SopsPage({ embedded }: { embedded?: boolean }) {
  const { isAdmin } = useAuth();
  const { data, loading, error, reload } = useAsync(fetchSops, []);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Sop | 'new' | null>(null);
  const [reading, setReading] = useState<Sop | null>(null);

  const q = query.trim().toLowerCase();
  const sops = (data ?? []).filter((s) => !q || `${s.title} ${s.area} ${s.description ?? ''} ${s.body ?? ''}`.toLowerCase().includes(q));
  const areas = [...new Set(sops.map((s) => s.area))].sort((a, b) => (AREAS.indexOf(a) + 99) % 99 - (AREAS.indexOf(b) + 99) % 99 || a.localeCompare(b));

  const open = (s: Sop) => (s.url ? window.open(s.url, '_blank', 'noopener') : setReading(s));

  return (
    <div className={embedded ? '' : 'fade-in'}>
      {!embedded && (
        <header className="page__header">
          <span className="eyebrow">Equipo Genesis</span>
          <h1 className="page__title">SOPs</h1>
          <p className="page__lead">Cómo hacemos las cosas: cada proceso del negocio, paso a paso. Si algo cambia, se actualiza acá.</p>
        </header>
      )}
      <div className="toolbar">
        <input className="field field--search" type="search" placeholder="Buscar SOP…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {isAdmin && <button className="btn btn--primary" onClick={() => setEditing('new')}>+ Nuevo SOP</button>}
      </div>

      <State
        loading={loading}
        error={error}
        empty={!data?.length}
        emptyState={{
          title: 'Todavía no hay SOPs',
          text: isAdmin ? 'Cargá cada proceso con su link (artifact, Doc o Loom) o escribilo acá.' : 'Cuando el equipo cargue procesos, los vas a ver acá.',
          action: isAdmin ? { label: 'Nuevo SOP', onClick: () => setEditing('new') } : undefined,
        }}
      >
        {sops.length === 0 && <p className="muted">Ningún SOP coincide con la búsqueda.</p>}
        {areas.map((area) => (
          <section key={area} className="sops__group">
            <h2 className="section-title section-title--sm">{area}</h2>
            <div className="sops__grid">
              {sops.filter((s) => s.area === area).map((s) => (
                <article key={s.id} className={`glass sop${s.published ? '' : ' sop--draft'}`}>
                  <button type="button" className="sop__main" onClick={() => open(s)}>
                    <span className="sop__title">{s.title}</span>
                    {s.description && <span className="muted sop__desc">{s.description}</span>}
                  </button>
                  <div className="sop__foot">
                    <span className="sop__meta">
                      {!s.published && <Pill tone="muted">Borrador</Pill>}
                      {s.audience === 'admin' && <Pill tone="accent">Solo admins</Pill>}
                      <span className="muted">Actualizado {fmtDate(s.updated_at)}</span>
                    </span>
                    <span className="sop__actions">
                      {isAdmin && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(s)}>Editar</button>}
                      <button type="button" className="btn btn--primary btn--sm" onClick={() => open(s)}>
                        {s.url ? 'Abrir' : 'Leer'} <ArrowRight width={14} height={14} />
                      </button>
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </State>

      {reading && (
        <Modal title={reading.title} onClose={() => setReading(null)} wide>
          <p className="sop__body">{reading.body}</p>
        </Modal>
      )}
      {editing && <SopModal sop={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function SopModal({ sop, onClose, onSaved }: { sop: Sop | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    title: sop?.title ?? '',
    area: sop?.area ?? 'Ventas',
    description: sop?.description ?? '',
    url: sop?.url ?? '',
    body: sop?.body ?? '',
    audience: sop?.audience ?? 'equipo',
    published: sop?.published ?? true,
    position: String(sop?.position ?? 0),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.url.trim() && !v.body.trim()) return setError('Poné el link al SOP o escribilo en el texto.');
    setBusy(true);
    const payload = {
      title: v.title.trim(),
      area: v.area.trim() || 'General',
      description: v.description.trim() || null,
      url: v.url.trim() || null,
      body: v.body.trim() || null,
      audience: v.audience,
      published: v.published,
      position: Number(v.position) || 0,
      updated_at: new Date().toISOString(),
    };
    const { error: err } = sop ? await supabase.from('sops').update(payload).eq('id', sop.id) : await supabase.from('sops').insert(payload);
    setBusy(false);
    if (err) return setError(err.message);
    onSaved();
  };

  const remove = async () => {
    if (!sop || !window.confirm(`¿Eliminar el SOP «${sop.title}»?`)) return;
    const { error: err } = await supabase.from('sops').delete().eq('id', sop.id);
    if (err) return setError(err.message);
    onSaved();
  };

  return (
    <Modal title={sop ? 'Editar SOP' : 'Nuevo SOP'} onClose={onClose} wide>
      <form className="aform" onSubmit={submit}>
        <Field label="Título" full><input className="field" value={v.title} onChange={set('title')} required autoFocus /></Field>
        <Field label="Área">
          <input className="field" list="sop-areas" value={v.area} onChange={set('area')} />
          <datalist id="sop-areas">{AREAS.map((a) => <option key={a} value={a} />)}</datalist>
        </Field>
        <Field label="Orden dentro del área"><input className="field" type="number" value={v.position} onChange={set('position')} /></Field>
        <Field label="De qué se trata (una línea)" full><input className="field" value={v.description} onChange={set('description')} /></Field>
        <Field label="Link al SOP (artifact, Google Doc, Loom…)" full><input className="field" type="url" value={v.url} onChange={set('url')} placeholder="https://" /></Field>
        <Field label="O escribilo acá" full><textarea className="field field--area" rows={8} value={v.body} onChange={set('body')} placeholder="Paso 1…" /></Field>
        <Field label="Quién lo ve">
          <select className="field field--select" value={v.audience} onChange={set('audience')}>
            <option value="equipo">Todo el equipo (admins, SDRs y closers)</option>
            <option value="admin">Solo admins</option>
          </select>
        </Field>
        <label className="check">
          <input type="checkbox" checked={v.published} onChange={(e) => setV((s) => ({ ...s, published: e.target.checked }))} /> Publicado
        </label>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          {sop && <button type="button" className="btn btn--ghost btn--danger" onClick={remove}>Eliminar</button>}
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
