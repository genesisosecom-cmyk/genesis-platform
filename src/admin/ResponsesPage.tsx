import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAsync } from '../lib/useAsync';
import { fetchForms, fetchResponses } from './api';
import { Pill, State } from './ui';
import { fmtDate, fmtDateTime } from '../lib/format';

const load = () => Promise.all([fetchResponses(), fetchForms()]);

export default function ResponsesPage() {
  const { data, loading, error } = useAsync(load, []);
  const navigate = useNavigate();
  const [formId, setFormId] = useState('all');
  const [status, setStatus] = useState<'all' | 'unread' | 'read'>('unread');
  const [query, setQuery] = useState('');

  const [responses = [], forms = []] = data ?? [];
  const q = query.trim().toLowerCase();
  const rows = responses.filter(
    (r) =>
      (formId === 'all' || r.form_id === formId) &&
      (status === 'all' || (status === 'unread' ? !r.reviewed : r.reviewed)) &&
      (!q || `${r.respondent_name} ${r.respondent_email} ${JSON.stringify(r.answers)}`.toLowerCase().includes(q)),
  );

  return (
    <>
      <div className="toolbar">
        <div className="chips">
          {(['unread', 'read', 'all'] as const).map((s) => (
            <button key={s} className={`chip${status === s ? ' is-active' : ''}`} onClick={() => setStatus(s)}>
              {s === 'unread' ? `Sin leer (${responses.filter((r) => !r.reviewed).length})` : s === 'read' ? 'Leídas' : 'Todas'}
            </button>
          ))}
          <select className="field field--select" value={formId} onChange={(e) => setFormId(e.target.value)}>
            <option value="all">Todos los formularios</option>
            {forms.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
        </div>
        <input className="field field--search" type="search" placeholder="Buscar en respuestas…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <State loading={loading} error={error} empty={!rows.length}>
        <div className="glass table-wrap">
          <table className="table">
            <thead>
              <tr><th>Cliente</th><th>Formulario</th><th>Llamada</th><th>Enviado</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="table__row" onClick={() => navigate(`/admin/respuestas/${r.id}`)}>
                  <td>
                    <div className="cell-main"><Link to={`/admin/respuestas/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.respondent_name}</Link></div>
                    <div className="cell-sub">{r.respondent_email}</div>
                  </td>
                  <td>{forms.find((f) => f.id === r.form_id)?.title ?? '—'}</td>
                  <td>{fmtDate(r.call_date)}</td>
                  <td>{fmtDateTime(r.submitted_at)}</td>
                  <td>{r.reviewed ? <Pill tone="muted">Leída</Pill> : <Pill tone="accent">Nueva</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </State>
    </>
  );
}
