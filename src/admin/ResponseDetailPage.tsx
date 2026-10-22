import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, unwrap } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { Pill, State } from './ui';
import { fmtDate, fmtDateTime } from '../lib/format';
import type { Client, Form, FormResponse } from '../lib/types';
import { ArrowLeft, Check } from '../components/Icons';

/** Escapa comodines de ILIKE para comparar emails de forma exacta sin distinguir mayúsculas. */
const exact = (v: string) => v.replace(/[\\%_]/g, '\\$&');

async function load(id: string) {
  const response = unwrap(await supabase.from('form_responses').select('*').eq('id', id).single()) as FormResponse;
  const [form, clients, history] = await Promise.all([
    supabase.from('forms').select('*').eq('id', response.form_id).single().then((r) => unwrap(r) as Form),
    supabase.from('clients').select('*').ilike('email', exact(response.respondent_email)).then((r) => unwrap(r) as Client[]),
    supabase
      .from('form_responses')
      .select('id, form_id, submitted_at, call_date')
      .ilike('respondent_email', exact(response.respondent_email))
      .neq('id', id)
      .order('submitted_at', { ascending: false })
      .then((r) => unwrap(r) as Pick<FormResponse, 'id' | 'form_id' | 'submitted_at' | 'call_date'>[]),
  ]);
  return { response, form, client: clients[0], history };
}

export default function ResponseDetailPage() {
  const { responseId = '' } = useParams();
  const { data, loading, error, reload } = useAsync(() => load(responseId), [responseId]);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState('');
  const navigate = useNavigate();

  const remove = async () => {
    if (!window.confirm('¿Eliminar esta respuesta? No se puede deshacer.')) return;
    const { error: err } = await supabase.from('form_responses').delete().eq('id', responseId);
    if (err) return setSaved(err.message);
    navigate('/admin/respuestas');
  };

  useEffect(() => setNotes(data?.response.admin_notes ?? ''), [data]);

  const update = async (patch: Partial<FormResponse>) => {
    const { error: err } = await supabase.from('form_responses').update(patch).eq('id', responseId);
    setSaved(err ? err.message : 'Guardado');
    reload();
  };

  return (
    <>
      <Link to="/admin/respuestas" className="back"><ArrowLeft width={16} height={16} /> Respuestas</Link>
      <State loading={loading} error={error}>
        {data && (
          <div className="lesson-layout">
            <section className="glass panel">
              <span className="eyebrow">{data.response.slot_label ?? `${data.form.title} · Llamada ${data.form.call_type}`}</span>
              <h2 className="page__title page__title--sm">{data.response.respondent_name}</h2>
              <div className="detail-meta">
                {data.response.program && <Pill tone="accent">{data.response.program}</Pill>}
                <span>{data.response.respondent_email}</span>
                <span>Clase: {data.response.call_date ? fmtDate(data.response.call_date) : data.response.call_kind === '1:1' ? 'a coordinar' : '—'}</span>
                <span>Enviado: {fmtDateTime(data.response.submitted_at)}</span>
              </div>
              <dl className="answers">
                {Array.isArray(data.response.answers.preguntas) &&
                  data.response.answers.preguntas.map((q, i) => (
                    <div key={i} className="answers__item">
                      <dt>Pregunta {i + 1}</dt>
                      <dd>{q}</dd>
                    </div>
                  ))}
                {data.form.questions.map((q) => (
                  <div key={q.id} className="answers__item">
                    <dt>{q.label}</dt>
                    <dd>{data.response.answers[q.id] !== undefined && data.response.answers[q.id] !== '' ? String(data.response.answers[q.id]) + (q.type === 'scale' ? ` / ${q.max ?? 5}` : '') : <span className="muted">Sin respuesta</span>}</dd>
                  </div>
                ))}
                {/* Respuestas a preguntas que ya no están en el formulario. */}
                {Object.entries(data.response.answers)
                  .filter(([k]) => k !== 'preguntas' && !data.form.questions.some((q) => q.id === k))
                  .map(([k, v]) => (
                    <div key={k} className="answers__item"><dt>{k}</dt><dd>{String(v)}</dd></div>
                  ))}
              </dl>
            </section>

            <aside className="glass panel side-panel">
              <button className={`btn ${data.response.reviewed ? 'btn--done' : 'btn--primary'}`} onClick={() => update({ reviewed: !data.response.reviewed })}>
                <Check width={16} height={16} /> {data.response.reviewed ? 'Leída' : 'Marcar como leída'}
              </button>
              <label className="afield">
                <span className="afield__label">Notas internas (prep de la llamada)</span>
                <textarea className="field field--area" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <button className="btn btn--ghost" onClick={() => update({ admin_notes: notes || null })}>Guardar notas</button>
              {saved && <span className="muted">{saved}</span>}
              <button className="btn btn--ghost btn--danger" onClick={remove}>Eliminar respuesta</button>

              {data.client && (
                <Link to={`/admin/clientes/${data.client.id}`} className="link">Ficha de cliente: {data.client.full_name} →</Link>
              )}
              {data.history.length > 0 && (
                <div>
                  <span className="afield__label">Otras respuestas de este cliente</span>
                  <ul className="mini-list">
                    {data.history.map((h) => (
                      <li key={h.id}>
                        <Link to={`/admin/respuestas/${h.id}`} className="mini-list__item">
                          <span>{fmtDateTime(h.submitted_at)}</span>
                          <span className="muted">{h.call_date ? `Clase ${fmtDate(h.call_date)}` : ''}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          </div>
        )}
      </State>
    </>
  );
}
