import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAsync } from '../lib/useAsync';
import { fetchForms, fetchResponses } from './api';
import { Pill, State } from './ui';
import { fmtDate, fmtDateTime, todayISO } from '../lib/format';
import type { FormResponse } from '../lib/types';

const load = () => Promise.all([fetchResponses(), fetchForms()]);

/** Cantidad de preguntas en una respuesta Pre-clase (o null si es otro tipo de formulario). */
export const questionCount = (r: FormResponse) => (Array.isArray(r.answers.preguntas) ? r.answers.preguntas.length : null);

export default function ResponsesPage() {
  const { data, loading, error } = useAsync(load, []);
  const navigate = useNavigate();
  const [status, setStatus] = useState<'all' | 'unread' | 'read'>('unread');
  const [period, setPeriod] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [coach, setCoach] = useState('all');
  const [formId, setFormId] = useState('all');
  const [query, setQuery] = useState('');

  const [responses = [], forms = []] = data ?? [];
  const coaches = [...new Set(responses.map((r) => r.coach).filter(Boolean))] as string[];
  const today = todayISO();
  const q = query.trim().toLowerCase();

  const rows = responses
    .filter(
      (r) =>
        (status === 'all' || (status === 'unread' ? !r.reviewed : r.reviewed)) &&
        (period === 'all' || (period === 'upcoming' ? !r.call_date || r.call_date >= today : !!r.call_date && r.call_date < today)) &&
        (coach === 'all' || r.coach === coach) &&
        (formId === 'all' || r.form_id === formId) &&
        (!q || `${r.respondent_name} ${r.respondent_email} ${r.program ?? ''} ${JSON.stringify(r.answers)}`.toLowerCase().includes(q)),
    )
    .sort((a, b) =>
      period === 'upcoming'
        ? (a.call_date ?? '9999').localeCompare(b.call_date ?? '9999') || a.submitted_at.localeCompare(b.submitted_at)
        : b.submitted_at.localeCompare(a.submitted_at),
    );

  return (
    <>
      <div className="toolbar">
        <div className="chips">
          {(['upcoming', 'past', 'all'] as const).map((p) => (
            <button key={p} className={`chip${period === p ? ' is-active' : ''}`} onClick={() => setPeriod(p)}>
              {p === 'upcoming' ? 'Próximas clases' : p === 'past' ? 'Clases pasadas' : 'Todas las fechas'}
            </button>
          ))}
        </div>
        <input className="field field--search" type="search" placeholder="Buscar en respuestas…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="toolbar">
        <div className="chips">
          {(['unread', 'read', 'all'] as const).map((s) => (
            <button key={s} className={`chip${status === s ? ' is-active' : ''}`} onClick={() => setStatus(s)}>
              {s === 'unread' ? `Sin leer (${responses.filter((r) => !r.reviewed).length})` : s === 'read' ? 'Leídas' : 'Todas'}
            </button>
          ))}
          {coaches.length > 0 && (
            <select className="field field--select" value={coach} onChange={(e) => setCoach(e.target.value)}>
              <option value="all">Todos los coaches</option>
              {coaches.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select className="field field--select" value={formId} onChange={(e) => setFormId(e.target.value)}>
            <option value="all">Todos los formularios</option>
            {forms.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
        </div>
      </div>

      <State loading={loading} error={error} empty={!rows.length}>
        <div className="glass table-wrap">
          <table className="table">
            <thead>
              <tr><th>Alumno</th><th>Clase</th><th>Fecha de clase</th><th>Preguntas</th><th>Enviado</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const n = questionCount(r);
                return (
                  <tr key={r.id} className="table__row" onClick={() => navigate(`/admin/respuestas/${r.id}`)}>
                    <td>
                      <div className="cell-main"><Link to={`/admin/respuestas/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.respondent_name}</Link></div>
                      <div className="cell-sub">{[r.program, r.respondent_email].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td>{r.slot_label ?? forms.find((f) => f.id === r.form_id)?.title ?? '—'}</td>
                    <td>{r.call_date ? fmtDate(r.call_date) : r.call_kind === '1:1' ? 'A coordinar' : '—'}</td>
                    <td>{n ?? '—'}</td>
                    <td>{fmtDateTime(r.submitted_at)}</td>
                    <td>{r.reviewed ? <Pill tone="muted">Leída</Pill> : <Pill tone="accent">Nueva</Pill>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </State>
    </>
  );
}
