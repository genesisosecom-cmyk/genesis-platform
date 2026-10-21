import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../lib/useAsync';
import { supabase } from '../lib/supabase';
import { fetchForms, fetchResponses } from './api';
import { Field, Modal, Pill, State } from './ui';
import type { CallType, Form, Question, QuestionType } from '../lib/types';
import { External } from '../components/Icons';

const load = () => Promise.all([fetchForms(), fetchResponses()]);
const publicUrl = (slug: string) => `${window.location.origin}/f/${slug}`;

export default function FormsPage() {
  const { data, loading, error, reload } = useAsync(load, []);
  const [editing, setEditing] = useState<Form | 'new' | null>(null);
  const [copied, setCopied] = useState('');
  const [forms = [], responses = []] = data ?? [];

  const copy = async (slug: string) => {
    await navigator.clipboard.writeText(publicUrl(slug));
    setCopied(slug);
    setTimeout(() => setCopied(''), 1800);
  };

  const toggle = async (f: Form) => {
    await supabase.from('forms').update({ is_active: !f.is_active }).eq('id', f.id);
    reload();
  };

  return (
    <>
      <div className="toolbar">
        <p className="muted">Mandale el link al cliente antes de la llamada. No necesita cuenta para responder.</p>
        <button className="btn btn--primary" onClick={() => setEditing('new')}>+ Nuevo formulario</button>
      </div>
      <State loading={loading} error={error} empty={!forms.length}>
        <div className="grid">
          {forms.map((f) => {
            const rs = responses.filter((r) => r.form_id === f.id);
            const unread = rs.filter((r) => !r.reviewed).length;
            return (
              <div key={f.id} className="glass tool-card">
                <div className="tool-card__top">
                  <Pill tone="muted">Llamada {f.call_type}</Pill>
                  {f.is_active ? <Pill tone="ok">Activo</Pill> : <Pill tone="muted">Pausado</Pill>}
                </div>
                <h2 className="tool-card__title">{f.title}</h2>
                <p className="muted">{f.questions.length} preguntas · {rs.length} respuestas{unread ? ` · ${unread} sin leer` : ''}</p>
                <code className="link-box">/f/{f.slug}</code>
                <div className="card-actions">
                  <button className="btn btn--ghost btn--sm" onClick={() => copy(f.slug)}>{copied === f.slug ? '¡Copiado!' : 'Copiar link'}</button>
                  <a className="btn btn--ghost btn--sm" href={`/f/${f.slug}`} target="_blank" rel="noreferrer">Ver <External width={14} height={14} /></a>
                  <button className="btn btn--ghost btn--sm" onClick={() => setEditing(f)}>Editar</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => toggle(f)}>{f.is_active ? 'Pausar' : 'Activar'}</button>
                  {rs.length > 0 && <Link className="btn btn--ghost btn--sm" to="/admin/respuestas">Respuestas</Link>}
                </div>
              </div>
            );
          })}
        </div>
      </State>
      {editing && (
        <FormEditor
          form={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </>
  );
}

const TYPE_LABELS: Record<QuestionType, string> = {
  text: 'Texto corto',
  textarea: 'Texto largo',
  select: 'Opción única',
  scale: 'Escala',
};

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function FormEditor({ form, onClose, onSaved }: { form: Form | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(form?.title ?? '');
  const [slug, setSlug] = useState(form?.slug ?? '');
  const [description, setDescription] = useState(form?.description ?? '');
  const [callType, setCallType] = useState<CallType>(form?.call_type ?? '1:1');
  const [questions, setQuestions] = useState<Question[]>(form?.questions ?? []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const setQ = (i: number, patch: Partial<Question>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: number) =>
    setQuestions((qs) => {
      const next = [...qs];
      const j = i + d;
      if (j < 0 || j >= next.length) return qs;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const add = () =>
    setQuestions((qs) => [...qs, { id: `p${Date.now().toString(36)}`, label: '', type: 'textarea', required: false }]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const finalSlug = slugify(slug || title);
    if (!title.trim() || !finalSlug) return setError('El formulario necesita un título');
    if (questions.some((q) => !q.label.trim())) return setError('Todas las preguntas necesitan un texto');
    if (questions.some((q) => q.type === 'select' && !(q.options ?? []).length)) return setError('Las preguntas de opción única necesitan opciones');
    setSaving(true);
    const payload = { title: title.trim(), slug: finalSlug, description: description.trim() || null, call_type: callType, questions };
    const { error: err } = form
      ? await supabase.from('forms').update(payload).eq('id', form.id)
      : await supabase.from('forms').insert(payload);
    setSaving(false);
    if (err) return setError(err.code === '23505' ? 'Ya existe un formulario con ese link' : err.message);
    onSaved();
  };

  return (
    <Modal title={form ? 'Editar formulario' : 'Nuevo formulario'} onClose={onClose} wide>
      <form className="aform" onSubmit={submit}>
        <Field label="Título"><input className="field" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Link (/f/…)"><input className="field" value={slug} placeholder={slugify(title)} onChange={(e) => setSlug(e.target.value)} /></Field>
        <Field label="Tipo de llamada">
          <select className="field field--select" value={callType} onChange={(e) => setCallType(e.target.value as CallType)}>
            <option value="1:1">1:1</option>
            <option value="grupal">Grupal</option>
          </select>
        </Field>
        <Field label="Descripción" full><textarea className="field field--area" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>

        <div className="afield--full">
          <span className="afield__label">Preguntas (nombre, email y fecha de llamada se piden siempre)</span>
          <div className="q-editor">
            {questions.map((q, i) => (
              <div key={q.id} className="q-editor__item">
                <div className="q-editor__row">
                  <span className="row__num">{i + 1}</span>
                  <input className="field" placeholder="Pregunta" value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} />
                  <select className="field field--select" value={q.type} onChange={(e) => setQ(i, { type: e.target.value as QuestionType })}>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="q-editor__row">
                  <input className="field" placeholder="Ayuda (opcional)" value={q.help ?? ''} onChange={(e) => setQ(i, { help: e.target.value || undefined })} />
                  {q.type === 'select' && (
                    <input className="field" placeholder="Opciones separadas por coma" value={(q.options ?? []).join(', ')} onChange={(e) => setQ(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} />
                  )}
                  {q.type === 'scale' && (
                    <>
                      <input className="field field--num" type="number" title="Mínimo" value={q.min ?? 1} onChange={(e) => setQ(i, { min: Number(e.target.value) })} />
                      <input className="field field--num" type="number" title="Máximo" value={q.max ?? 5} onChange={(e) => setQ(i, { max: Number(e.target.value) })} />
                    </>
                  )}
                </div>
                <div className="q-editor__row q-editor__row--actions">
                  <label className="check"><input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} /> Obligatoria</label>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => move(i, 1)} disabled={i === questions.length - 1}>↓</button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}>Eliminar</button>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn--ghost" onClick={add}>+ Agregar pregunta</button>
          </div>
        </div>

        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
