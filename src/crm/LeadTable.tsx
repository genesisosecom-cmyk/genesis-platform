import { useNavigate } from 'react-router-dom';
import { Pill } from '../admin/ui';
import { fmtDateTime } from '../lib/format';
import type { SalesRep } from '../lib/types';
import type { LeadRow } from './api';
import { StatusPill, WhatsAppButton } from './components';

const MAX_ROWS = 300;

/** Lista de leads. `linkTo` arma la ruta de la ficha; con `reps`, muestra SDR y closer. */
export default function LeadTable({ rows, linkTo, reps }: { rows: LeadRow[]; linkTo: (r: LeadRow) => string; reps?: SalesRep[] }) {
  const navigate = useNavigate();
  const name = (id: string | null) => (id ? reps?.find((r) => r.id === id)?.name ?? '—' : null);
  const overdue = (iso: string | null) => Boolean(iso && new Date(iso) <= new Date());

  return (
    <>
      <div className="glass table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Lead</th>
              <th>WhatsApp</th>
              <th>Inversión</th>
              <th>Landing</th>
              <th>Grupo</th>
              <th>Aplicó</th>
              {reps && <th>SDR</th>}
              {reps && <th>Closer</th>}
              <th>Estado</th>
              <th>Próxima tarea</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, MAX_ROWS).map((r) => (
              <tr key={r.id} className="table__row" onClick={() => navigate(linkTo(r))}>
                <td>
                  <div className="cell-main">
                    {r.lead.full_name || '—'}
                    {r.lead.possible_duplicate && <Pill tone="warn">Posible duplicado</Pill>}
                  </div>
                  <div className="cell-sub">{r.lead.email ?? (r.lead.phone ? `+${r.lead.phone}` : '—')}</div>
                </td>
                <td><WhatsAppButton phone={r.lead.phone} small /></td>
                <td>
                  <div>{r.inversion_meta ?? '—'}</div>
                  {r.califica && <div className="cell-sub"><Pill tone="ok">Califica</Pill></div>}
                </td>
                <td>
                  <div>Versión {r.variant ?? '—'}</div>
                  <div className="cell-sub">{r.source ?? '—'}</div>
                </td>
                <td>{r.toco_grupo ? <Pill tone="accent">Sí</Pill> : <span className="muted">No</span>}</td>
                <td>
                  {r.route === 'aplicado' && <Pill tone="ok">Aplicó</Pill>}
                  {r.route === 'rechazado' && <Pill tone="muted">Próximo ciclo</Pill>}
                  {!r.route && <span className="muted">No</span>}
                </td>
                {reps && <td>{name(r.lead.sdr_id) ?? <Pill tone="warn">Sin asignar</Pill>}</td>}
                {reps && <td>{name(r.closer_id) ?? '—'}</td>}
                <td><StatusPill status={r.post_class_status} /></td>
                <td>
                  {r.next_action_at ? (
                    <>
                      <div className={overdue(r.next_action_at) ? 'text-warn' : undefined}>{fmtDateTime(r.next_action_at)}</div>
                      <div className="cell-sub">{r.next_action ?? ''}</div>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > MAX_ROWS && (
        <p className="muted" style={{ marginTop: 12 }}>Mostrando {MAX_ROWS} de {rows.length}. Usá el buscador o los filtros.</p>
      )}
    </>
  );
}

/** Texto para el buscador. */
export const searchText = (r: LeadRow) => `${r.lead.full_name} ${r.lead.email ?? ''} ${r.lead.phone ?? ''} ${r.source ?? ''}`.toLowerCase();
