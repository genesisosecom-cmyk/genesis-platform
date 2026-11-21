import { useState } from 'react';
import { useAsync } from '../../lib/useAsync';
import { useLiveReload } from '../../lib/realtime';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { EmptyState, Kpi, Modal, Pill, State } from '../ui';
import { useFunnels } from '../../funnels/FunnelContext';
import { fetchCalls, fetchReports, type CallRow, type ReportRow } from '../../crm/api';
import { ReportEditor, ReportView } from '../../crm/ReportForm';
import { PAINS, SUBAVATARS } from '../../funnels/api';

type Outcome = 'all' | 'cerro' | 'no_cerro' | 'seguimiento' | 'sin_llamada';
const OUTCOMES: [Outcome, string][] = [['all', 'Todos'], ['cerro', 'Cerró'], ['no_cerro', 'No cerró'], ['seguimiento', 'Seguimiento'], ['sin_llamada', 'Antes de la llamada']];
const outcomeOf = (r: ReportRow): Outcome => (r.sales_call?.result ?? 'sin_llamada') as Outcome;
const OUTCOME_PILL: Record<string, ['ok' | 'warn' | 'muted' | 'accent', string]> = { cerro: ['ok', 'Cerró'], no_cerro: ['warn', 'No cerró'], seguimiento: ['accent', 'Seguimiento'], sin_llamada: ['muted', 'Antes de la llamada'] };
const name = (r: { lead_launch: { lead: { full_name: string; email: string | null; instagram: string | null } } }) => r.lead_launch.lead.full_name || r.lead_launch.lead.email || (r.lead_launch.lead.instagram ? `@${r.lead_launch.lead.instagram}` : '—');

/**
 * Reportes de ventas por fases (SOP 04): el insumo del ritual del sábado. Filtra por dolor,
 * subavatar y motivo de no cierre, y marca las llamadas hechas que todavía no tienen reporte.
 */
export default function SalesReportsPage() {
  const { funnelId, cycles, loading: fLoading } = useFunnels();
  const launchIds = funnelId === 'all' ? undefined : cycles.map((l) => l.id);
  const key = launchIds?.join(',') ?? 'all';
  const { data, loading, error, reload } = useAsync(() => Promise.all([fetchReports(launchIds), fetchCalls({})]), [key]);
  useLiveReload(['sales_reports', 'sales_calls'], reload, { delayMs: 2000 });
  const [pain, setPain] = useState('all');
  const [sub, setSub] = useState('all');
  const [outcome, setOutcome] = useState<Outcome>('all');
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState<{ report: ReportRow | null; call: CallRow | null } | null>(null);

  const [reports = [], allCalls = []] = data ?? [];
  // Llamadas con resultado (se hicieron) que no tienen reporte: hay que cargarlo.
  const missing = allCalls.filter(
    (c) => c.result && (!launchIds || launchIds.includes(c.lead_launch.launch_id)) && !reports.some((r) => r.sales_call_id === c.id),
  );
  const q = reason.trim().toLowerCase();
  const rows = reports.filter(
    (r) =>
      (pain === 'all' || String(r.pain ?? r.lead_launch.pain) === pain) &&
      (sub === 'all' || (sub === 'none' ? !r.lead_launch.subavatar : r.lead_launch.subavatar === sub)) &&
      (outcome === 'all' || outcomeOf(r) === outcome) &&
      (!q || `${r.no_close_reason ?? ''} ${r.objections ?? ''} ${r.buy_reason ?? ''} ${r.pain_quote ?? ''} ${r.goes_to}`.toLowerCase().includes(q)),
  );
  const count = (o: Outcome) => reports.filter((r) => outcomeOf(r) === o).length;

  return (
    <State loading={loading || fLoading} error={error}>
      <div className="kpis kpis--4">
        <Kpi label="Reportes" value={reports.length} />
        <Kpi label="Cerró · no cerró" value={`${count('cerro')} · ${count('no_cerro')}`} />
        <Kpi label="Sin «a qué pieza va»" value={reports.filter((r) => !r.goes_to.trim()).length} tone={reports.some((r) => !r.goes_to.trim()) ? 'warn' : undefined} hint="Cada dato tiene que ir a una pieza" />
        <Kpi label="Llamadas sin reporte" value={missing.length} tone={missing.length ? 'warn' : 'ok'} />
      </div>

      {missing.length > 0 && (
        <section className="glass panel" style={{ marginBottom: 22 }}>
          <h2 className="panel__title">Llamadas hechas que todavía no tienen reporte</h2>
          <ul className="mini-list">
            {missing.map((c) => (
              <li key={c.id}>
                <div className="mini-list__item">
                  <span>{name(c)} · {fmtDateTime(c.scheduled_at)} · {OUTCOME_PILL[c.result!]?.[1]}{c.program ? ` · ${c.program}` : ''}</span>
                  <button className="link link--btn" onClick={() => setOpen({ report: null, call: c })}>Cargar reporte</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="toolbar">
        <div className="chips">
          {OUTCOMES.map(([o, l]) => <button key={o} className={`chip${outcome === o ? ' is-active' : ''}`} onClick={() => setOutcome(o)}>{l}{o !== 'all' && <span className="muted"> {count(o)}</span>}</button>)}
        </div>
        <div className="filters" style={{ marginBottom: 0 }}>
          <select className="field field--select" value={pain} onChange={(e) => setPain(e.target.value)} aria-label="Dolor">
            <option value="all">Todos los dolores</option>
            {PAINS.map((p) => <option key={p} value={p}>Dolor {p}</option>)}
          </select>
          <select className="field field--select" value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Subavatar">
            <option value="all">Todos los subavatares</option>
            <option value="none">Sin clasificar</option>
            {SUBAVATARS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input className="field field--search" type="search" placeholder="Motivo de no cierre, objeción…" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>

      {!rows.length ? (
        <EmptyState title={reports.length ? 'Ningún reporte coincide' : 'Todavía no hay reportes'} text={reports.length ? 'Probá con otros filtros.' : 'Se cargan al cerrar cada llamada (y el setter puede adelantar las fases 1 y 2 desde la ficha del lead).'} />
      ) : (
        <div className="glass table-wrap">
          <table className="table">
            <thead><tr><th>Fecha</th><th>Lead</th><th>Sub</th><th>Dolor</th><th>Resultado</th><th>Carril</th><th>El dolor, textual</th><th>Por qué compró / no cerró</th><th>A qué pieza va</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const [tone, label] = OUTCOME_PILL[outcomeOf(r)];
                return (
                  <tr key={r.id} className="table__row" onClick={() => setOpen({ report: r, call: null })}>
                    <td>{fmtDate(r.created_at)}<div className="cell-sub">{r.author_name}</div></td>
                    <td><div className="cell-main">{name(r)}</div><div className="cell-sub">{r.lead_launch.entry_keyword ?? ''}</div></td>
                    <td>{r.lead_launch.subavatar ?? <span className="muted">—</span>}</td>
                    <td>{r.pain ?? r.lead_launch.pain ?? <span className="muted">—</span>}</td>
                    <td><Pill tone={tone}>{label}</Pill></td>
                    <td>{r.lane === 'os' ? 'OS' : r.lane === 'lite' ? 'Lite' : r.lane === 'ninguno' ? 'Ninguno' : <span className="muted">—</span>}</td>
                    <td className="cell-clip">{r.pain_quote ? `«${r.pain_quote}»` : <span className="muted">—</span>}</td>
                    <td className="cell-clip">{r.buy_reason ?? r.no_close_reason ?? <span className="muted">—</span>}</td>
                    <td className="cell-clip">{r.goes_to || <Pill tone="warn">Falta</Pill>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal title={`Reporte · ${name(open.report ?? open.call!)}`} onClose={() => setOpen(null)} wide>
          {open.report && (
            <>
              <ReportView report={open.report} />
              <h3 className="section-title section-title--sm" style={{ marginTop: 22 }}>Editar</h3>
            </>
          )}
          <ReportEditor
            leadLaunchId={open.report?.lead_launch_id ?? open.call!.lead_launch_id}
            callId={open.report?.sales_call_id ?? open.call?.id ?? null}
            report={open.report}
            onSaved={() => { reload(); setOpen(null); }}
          />
        </Modal>
      )}
    </State>
  );
}
