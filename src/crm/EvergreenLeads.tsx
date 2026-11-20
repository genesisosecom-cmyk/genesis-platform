import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../lib/useAsync';
import { useLiveReload } from '../lib/realtime';
import { fmtDate, fmtDateTime } from '../lib/format';
import { Field, Kpi, Modal, Pill, State } from '../admin/ui';
import type { Funnel, LeadLaunch, SalesRep } from '../lib/types';
import {
  claimLead,
  fetchCallsOf,
  fetchLeadEvents,
  fetchLeadRows,
  fetchReportOf,
  fetchSalesReps,
  igLink,
  registerKeyword,
  scheduleCall,
  updateLead,
  type LeadPatch,
  type LeadRow,
} from './api';
import { searchText } from './LeadTable';
import { CallsList, Timeline, WhatsAppButton } from './components';
import CallScheduler from './CallScheduler';
import { NewLeadModal } from './modals';
import { ReportEditor } from './ReportForm';
import { CHANNELS, fetchPieceOptions, FORMATS, labelOf, LANES, PAINS, SUBAVATARS } from '../funnels/api';

type View = 'tablero' | 'lista';

/** Etapas que ya no esperan nada del setter. */
const DONE_STAGES = ['Cerró OS', 'Cerró Lite', 'No cerró', 'No califica'];
const stageTone = (s: string) => (s.startsWith('Cerró') ? 'ok' : s === 'No cerró' || s === 'No califica' ? 'muted' : s === 'Llamada agendada' || s === 'Aplicó' ? 'accent' : 'muted') as 'ok' | 'muted' | 'accent';

const contact = (r: LeadRow) => (r.lead.instagram ? `@${r.lead.instagram}` : r.lead.phone ? `+${r.lead.phone}` : r.lead.email ?? '—');

/**
 * Leads de un ciclo del evergreen: entran por palabra clave (CUENTA, PISO…), avanzan por las
 * etapas de la configuración del funnel y se califican con la ficha (vende hoy + capital).
 * Lo usan el admin (Leads) y el setter (Panel SDR). `me` = id del SDR, para «Solo los míos».
 */
export default function EvergreenLeads({ launchId, funnel, me, linkTo }: { launchId: string; funnel: Funnel; me?: string | null; /** Ruta de la ficha completa (solo admin). */ linkTo?: (r: LeadRow) => string }) {
  const { data, loading, error, reload } = useAsync(() => Promise.all([fetchLeadRows(launchId), fetchSalesReps(), fetchPieceOptions(funnel.id)]), [launchId, funnel.id]);
  useLiveReload([{ table: 'lead_launches', filter: `launch_id=eq.${launchId}` }, { table: 'leads', event: 'UPDATE' }, 'sales_calls'], reload, { delayMs: 1500 });
  const { isAdmin, isSdr } = useAuth();
  const [view, setView] = useState<View>('tablero');
  const [query, setQuery] = useState('');
  const [keyword, setKeyword] = useState('all');
  const [sub, setSub] = useState('all');
  const [mine, setMine] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<null | 'palabra' | 'lead'>(null);

  const [rows = [], reps = [], pieces = []] = data ?? [];
  const stages = funnel.config.stages ?? [];
  const keywords = useMemo(() => [...new Set([...(funnel.config.keywords ?? []), ...rows.map((r) => r.entry_keyword).filter((k): k is string => Boolean(k))])], [funnel, rows]);
  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (keyword === 'all' || (keyword === 'none' ? !r.entry_keyword : r.entry_keyword === keyword)) &&
      (sub === 'all' || (sub === 'none' ? !r.subavatar : r.subavatar === sub)) &&
      (!mine || r.lead.sdr_id === me) &&
      (!q || `${searchText(r)} ${r.quote ?? ''} ${r.sells_what ?? ''}`.toLowerCase().includes(q)),
  );
  const current = open ? rows.find((r) => r.id === open) ?? null : null;
  const pieceTitle = (id: string | null) => pieces.find((p) => p.id === id)?.title ?? null;
  const n = (test: (r: LeadRow) => boolean) => rows.filter(test).length;

  return (
    <>
      <div className="toolbar">
        <div className="chips">
          <button className={`chip${view === 'tablero' ? ' is-active' : ''}`} onClick={() => setView('tablero')}>Tablero por etapa</button>
          <button className={`chip${view === 'lista' ? ' is-active' : ''}`} onClick={() => setView('lista')}>Lista</button>
        </div>
        <div className="toolbar__right">
          <input className="field field--search" type="search" placeholder="Buscar lead, palabra, frase…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn btn--ghost" onClick={() => setAdding('lead')}>+ Lead</button>
          <button className="btn btn--primary" onClick={() => setAdding('palabra')}>+ Cargar palabra</button>
        </div>
      </div>

      <State loading={loading} error={error}>
        <div className="kpis kpis--4">
          <Kpi label="Conversaciones" value={n((r) => Boolean(r.entry_keyword))} hint={`${rows.length} leads en el ciclo`} />
          <Kpi label="Calificadas" value={n((r) => r.califica === true)} tone="ok" hint={funnel.config.qualified_rule ? 'Vende hoy + capital para OS' : undefined} />
          <Kpi label="Aplicaron" value={n((r) => r.route === 'aplicado')} />
          <Kpi label="Llamadas y cierres" value={`${n((r) => r.agendo === true)} · ${n((r) => r.stage.startsWith('Cerró'))}`} hint="agendadas · cerradas" />
        </div>

        <div className="filters">
          <select className="field field--select" value={keyword} onChange={(e) => setKeyword(e.target.value)} aria-label="Palabra">
            <option value="all">Todas las palabras</option>
            <option value="none">Sin palabra</option>
            {keywords.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select className="field field--select" value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Subavatar">
            <option value="all">Todos los subavatares</option>
            <option value="none">Sin clasificar</option>
            {SUBAVATARS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {me && <button type="button" className={`chip${mine ? ' is-active' : ''}`} onClick={() => setMine((m) => !m)}>Solo los míos</button>}
        </div>

        <State loading={false} error={null} empty={!rows.length} emptyState={{ title: 'Todavía no entró ninguna palabra', text: 'Llegan desde ManyChat (ruta /palabra) o se cargan a mano.', action: { label: 'Cargar palabra', onClick: () => setAdding('palabra') } }}>
          {view === 'tablero' ? (
            <div className="tboard eboard" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(230px, 1fr))` }}>
              {stages.map((s) => {
                const col = filtered.filter((r) => r.stage === s);
                return (
                  <section key={s} className={`tcol${DONE_STAGES.includes(s) ? ' eboard__done' : ''}`}>
                    <header className="tcol__head"><span className="tdot" />{s}<span className="muted">{col.length}</span></header>
                    <div className="tcol__list">
                      {col.map((r) => (
                        <article key={r.id} className="tcard glass" onClick={() => setOpen(r.id)}>
                          <div className="tcard__top">
                            <span className="tcode">{r.entry_keyword ?? 'Sin palabra'}</span>
                            {r.subavatar && <span className="muted">{r.subavatar}</span>}
                          </div>
                          <div className="tcard__title">{r.lead.full_name || contact(r)}</div>
                          {r.quote && <div className="cell-sub">«{r.quote}»</div>}
                          <div className="tcard__meta">
                            <span className="tchip">{contact(r)}</span>
                            {r.califica === true && <Pill tone="ok">Califica</Pill>}
                            {r.lane === 'lite' && <Pill tone="muted">Lite</Pill>}
                          </div>
                        </article>
                      ))}
                      {col.length === 0 && <p className="muted tcol__empty">—</p>}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="glass table-wrap">
              <table className="table">
                <thead><tr><th>Lead</th><th>Palabra</th><th>Video que lo trajo</th><th>Subavatar</th><th>Dolor</th><th>Frase textual</th><th>Carril</th><th>Etapa</th><th>Entró</th></tr></thead>
                <tbody>
                  {filtered.slice(0, 300).map((r) => (
                    <tr key={r.id} className="table__row" onClick={() => setOpen(r.id)}>
                      <td><div className="cell-main">{r.lead.full_name || '—'}{r.califica === true && <Pill tone="ok">Califica</Pill>}</div><div className="cell-sub">{contact(r)}</div></td>
                      <td>{r.entry_keyword ?? <span className="muted">—</span>}<div className="cell-sub">{r.entry_channel ? labelOf(CHANNELS, r.entry_channel) : ''}</div></td>
                      <td className="cell-clip">{pieceTitle(r.entry_content_id) ?? <span className="muted">—</span>}</td>
                      <td>{r.subavatar ?? <span className="muted">—</span>}</td>
                      <td>{r.pain ?? <span className="muted">—</span>}</td>
                      <td className="cell-clip">{r.quote ? `«${r.quote}»` : <span className="muted">—</span>}</td>
                      <td>{r.lane ? (r.lane === 'os' ? 'OS' : r.lane === 'lite' ? 'Lite' : 'Sin llamada') : <span className="muted">—</span>}</td>
                      <td><Pill tone={stageTone(r.stage)}>{r.stage}</Pill></td>
                      <td>{fmtDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!filtered.length && rows.length > 0 && <p className="muted">Ningún lead coincide con los filtros.</p>}
        </State>
      </State>

      {current && (
        <LeadFicha
          key={current.id}
          row={current}
          funnel={funnel}
          reps={reps}
          pieces={pieces}
          canEdit={isAdmin || (isSdr && current.lead.sdr_id === me)}
          canClaim={isSdr && Boolean(me) && !current.lead.sdr_id}
          fullLink={linkTo?.(current)}
          onClose={() => setOpen(null)}
          onChanged={reload}
        />
      )}
      {adding === 'palabra' && <KeywordModal launchId={launchId} keywords={keywords} onClose={() => setAdding(null)} onSaved={(id) => { setAdding(null); reload(); setOpen(id); }} />}
      {adding === 'lead' && (
        <NewLeadModal closers={reps.filter((r) => r.closer_status === 'activo')} canAssign={Boolean(me)} funnelId={funnel.id} evergreen onClose={() => setAdding(null)} onCreated={() => { setAdding(null); reload(); }} />
      )}
    </>
  );
}

type Draft = Pick<LeadLaunch, 'stage' | 'subavatar' | 'entry_keyword' | 'entry_content_id' | 'entry_channel' | 'pain' | 'quote' | 'sells_today' | 'sells_what' | 'repurchase_cycle' | 'capital' | 'wanted_when' | 'lane' | 'sdr_notes'>;
const FIELDS: (keyof Draft)[] = ['stage', 'subavatar', 'entry_keyword', 'entry_content_id', 'entry_channel', 'pain', 'quote', 'sells_today', 'sells_what', 'repurchase_cycle', 'capital', 'wanted_when', 'lane', 'sdr_notes'];
const pick = (r: LeadLaunch): Draft => Object.fromEntries(FIELDS.map((k) => [k, r[k]])) as Draft;

/** Ficha del lead del evergreen: etapa, de dónde vino, las 4 preguntas de calificación, llamada y reporte. */
function LeadFicha({ row, funnel, reps, pieces, canEdit, canClaim, fullLink, onClose, onChanged }: {
  row: LeadRow;
  funnel: Funnel;
  reps: SalesRep[];
  pieces: Awaited<ReturnType<typeof fetchPieceOptions>>;
  canEdit: boolean;
  /** SDR sobre un lead sin dueño: lo tiene que tomar antes de editarlo. */
  canClaim: boolean;
  fullLink?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => pick(row));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'ficha' | 'llamada' | 'reporte' | 'historial'>('ficha');
  const extra = useAsync(() => Promise.all([fetchLeadEvents(row.lead_id), fetchCallsOf(row.id), fetchReportOf(row.id, null)]), [row.id, row.updated_at]);
  const [events = [], calls = [], report = null] = extra.data ?? [];

  const base = pick(row);
  const dirty = FIELDS.filter((k) => (draft[k] ?? null) !== (base[k] ?? null));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const text = (k: 'quote' | 'sells_what' | 'repurchase_cycle' | 'capital' | 'wanted_when' | 'sdr_notes', placeholder?: string, rows = 1) =>
    rows > 1
      ? <textarea className="field field--area rfield" rows={rows} disabled={!canEdit} value={draft[k] ?? ''} placeholder={placeholder} onChange={(e) => set(k, e.target.value || null)} />
      : <input className="field" disabled={!canEdit} value={draft[k] ?? ''} placeholder={placeholder} onChange={(e) => set(k, e.target.value || null)} />;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      extra.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = (e?: FormEvent) => {
    e?.preventDefault();
    if (!dirty.length) return;
    return run(() => updateLead(row.id, Object.fromEntries(dirty.map((k) => [k, draft[k]])) as LeadPatch));
  };

  const qualified = draft.sells_today === true && draft.lane === 'os';
  const ig = igLink(row.lead.instagram);

  return (
    <Modal title={row.lead.full_name || contact(row)} onClose={onClose} wide>
      <div className="detail-meta" style={{ marginBottom: 14 }}>
        <Pill tone={stageTone(row.stage)}>{row.stage}</Pill>
        {row.califica === true && <Pill tone="ok">Califica</Pill>}
        {row.califica === false && <Pill tone="muted">No califica para OS</Pill>}
        {ig && <a className="link" href={ig} target="_blank" rel="noopener noreferrer">@{row.lead.instagram}</a>}
        {row.lead.phone && <WhatsAppButton phone={row.lead.phone} small />}
        {row.lead.email && <span>{row.lead.email}</span>}
        <span>Entró el {fmtDateTime(row.created_at)}</span>
        {reps.find((r) => r.id === row.lead.sdr_id) && <span>Setter: {reps.find((r) => r.id === row.lead.sdr_id)!.name}</span>}
        {fullLink && <Link className="link" to={fullLink}>Ficha completa</Link>}
      </div>

      <nav className="tabs" style={{ marginBottom: 16 }}>
        {([['ficha', 'Ficha'], ['llamada', `Llamada${calls.length ? ` · ${calls.length}` : ''}`], ['reporte', 'Reporte por fases'], ['historial', 'Historial']] as const).map(([k, l]) => (
          <button key={k} type="button" className={`tabs__link tabs__btn${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      {tab === 'ficha' && (
        <form className="aform" onSubmit={save}>
          <Field label="Etapa">
            <select className="field field--select" disabled={!canEdit} value={draft.stage} onChange={(e) => set('stage', e.target.value)}>
              {!(funnel.config.stages ?? []).includes(draft.stage) && <option value={draft.stage}>{draft.stage}</option>}
              {(funnel.config.stages ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Subavatar">
            <select className="field field--select" disabled={!canEdit} value={draft.subavatar ?? ''} onChange={(e) => set('subavatar', (e.target.value || null) as Draft['subavatar'])}>
              <option value="">Sin clasificar</option>
              {SUBAVATARS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>

          <h4 className="rphase afield--full">De dónde vino</h4>
          <Field label="Palabra">
            <input className="field" list="ev-keywords" disabled={!canEdit} value={draft.entry_keyword ?? ''} onChange={(e) => set('entry_keyword', e.target.value.toUpperCase() || null)} />
            <datalist id="ev-keywords">{(funnel.config.keywords ?? []).map((k) => <option key={k} value={k} />)}</datalist>
          </Field>
          <Field label="Canal">
            <select className="field field--select" disabled={!canEdit} value={draft.entry_channel ?? ''} onChange={(e) => set('entry_channel', (e.target.value || null) as Draft['entry_channel'])}>
              <option value="">Sin dato</option>
              {CHANNELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Video o pieza que lo trajo" full>
            <select className="field field--select" style={{ width: '100%' }} disabled={!canEdit} value={draft.entry_content_id ?? ''} onChange={(e) => set('entry_content_id', e.target.value || null)}>
              <option value="">Sin dato</option>
              {pieces.map((p) => <option key={p.id} value={p.id}>{p.publish_at ? `${fmtDate(p.publish_at)} · ` : ''}{labelOf(FORMATS, p.format)} · {p.title.slice(0, 90)}{p.keyword ? ` (${p.keyword})` : ''}</option>)}
            </select>
          </Field>
          <Field label="Dolor del mapa">
            <select className="field field--select" disabled={!canEdit} value={draft.pain ?? ''} onChange={(e) => set('pain', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Sin definir</option>
              {PAINS.map((p) => <option key={p} value={p}>Dolor {p}</option>)}
            </select>
          </Field>
          <Field label="Frase textual del lead">{text('quote', 'Con sus palabras, sin resumir')}</Field>

          <h4 className="rphase afield--full">Calificación · las 4 preguntas</h4>
          <Field label="¿Vende hoy?">
            <div className="seg">
              {([['Sí', true], ['No', false], ['Sin dato', null]] as const).map(([l, v]) => (
                <button key={l} type="button" disabled={!canEdit} className={`seg__opt${draft.sells_today === v ? ' is-on' : ''}`} onClick={() => set('sells_today', v)}>{l}</button>
              ))}
            </div>
          </Field>
          <Field label="1 · Qué vende hoy y por dónde">{text('sells_what', 'Tienda propia, Mercado Libre…')}</Field>
          <Field label="2 · Cada cuánto se le termina el producto al cliente">{text('repurchase_cycle', 'Ej: 30 días')}</Field>
          <Field label="3 · Con cuánto capital cuenta para la marca">{text('capital', 'Ej: USD 5.000 en dos pagos')}</Field>
          <Field label="4 · Para cuándo lo quiere">{text('wanted_when')}</Field>
          <Field label="Carril">
            <select className="field field--select" disabled={!canEdit} value={draft.lane ?? ''} onChange={(e) => set('lane', (e.target.value || null) as Draft['lane'])}>
              <option value="">Sin definir</option>
              {LANES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <p className="muted afield--full" style={{ margin: 0 }}>
            Calificado = vende hoy + capital para Genesis OS (carril «Llamada de OS»). {qualified ? 'Con lo cargado, califica.' : draft.sells_today === false || (draft.lane && draft.lane !== 'os') ? 'Con lo cargado, no califica para OS.' : 'Falta completar para saberlo.'}
          </p>
          <Field label="Notas del setter" full>{text('sdr_notes', undefined, 3)}</Field>

          {error && <p className="login__error afield--full">{error}</p>}
          <div className="aform__actions afield--full">
            {!canEdit && canClaim && <button type="button" className="btn btn--primary" style={{ marginRight: 'auto' }} disabled={busy} onClick={() => run(() => claimLead(row.id))}>Tomar este lead</button>}
            {!canEdit && !canClaim && <span className="muted" style={{ marginRight: 'auto' }}>Este lead es de otro setter: solo lectura.</span>}
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cerrar</button>
            <button className="btn btn--primary" disabled={busy || !dirty.length || !canEdit}>{busy ? 'Guardando…' : dirty.length ? `Guardar (${dirty.length})` : 'Guardado'}</button>
          </div>
        </form>
      )}

      {tab === 'llamada' && (
        <div className="stack">
          <CallsList calls={calls} reps={reps} linkCalls={false} />
          {canEdit && !DONE_STAGES.includes(row.stage) && (
            <section>
              <h4 className="rphase">{row.agendo ? 'Reagendar la llamada' : 'Agendar la llamada'}</h4>
              <CallScheduler closers={reps.filter((r) => r.closer_status === 'activo')} busy={busy} onSubmit={(closerId, iso) => run(() => scheduleCall(row.id, closerId, iso, draft.sdr_notes ?? ''))} />
            </section>
          )}
          {error && <p className="state--error">{error}</p>}
        </div>
      )}

      {tab === 'reporte' && (
        <>
          <p className="muted">El setter carga las fases 1 y 2 antes de la llamada. El closer completa la fase 3 al cerrar: sin reporte, la llamada no se puede marcar como realizada.</p>
          {extra.data && <ReportEditor key={report?.id ?? 'nuevo'} leadLaunchId={row.id} callId={null} report={report} phases={[1, 2]} onSaved={() => { extra.reload(); onChanged(); }} />}
        </>
      )}

      {tab === 'historial' && <Timeline events={events.filter((e) => e.launch_id === row.launch_id || !e.launch_id)} />}
    </Modal>
  );
}

/** Carga manual de una palabra: lo mismo que hace ManyChat por la ruta /palabra. */
function KeywordModal({ launchId, keywords, onClose, onSaved }: { launchId: string; keywords: string[]; onClose: () => void; onSaved: (leadLaunchId: string) => void }) {
  const [v, setV] = useState({ nombre: '', instagram: '', telefono: '', keyword: keywords[0] ?? '', canal: 'instagram_dm' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.keyword.trim()) return setError('Falta la palabra.');
    if (!v.instagram.trim() && !v.telefono.trim()) return setError('Cargá el Instagram o el WhatsApp.');
    setBusy(true);
    setError(null);
    try {
      const r = await registerKeyword({ ...v, launch_id: launchId });
      onSaved(r.lead_launch_id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Cargar palabra" onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Palabra *">
          <input className="field" list="kw-list" value={v.keyword} onChange={(e) => setV((s) => ({ ...s, keyword: e.target.value.toUpperCase() }))} autoFocus />
          <datalist id="kw-list">{keywords.map((k) => <option key={k} value={k} />)}</datalist>
        </Field>
        <Field label="Canal">
          <select className="field field--select" value={v.canal} onChange={set('canal')}>
            {CHANNELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Nombre" full><input className="field" value={v.nombre} onChange={set('nombre')} /></Field>
        <Field label="Instagram"><input className="field" value={v.instagram} onChange={set('instagram')} placeholder="@usuario" /></Field>
        <Field label="WhatsApp (con código de país)"><input className="field" value={v.telefono} onChange={set('telefono')} placeholder="+54 9 11 …" /></Field>
        <p className="muted afield--full" style={{ margin: 0 }}>Si la persona ya está cargada (mismo Instagram o teléfono) se suma a su historial, no se duplica. La pieza que lo trajo se resuelve sola por palabra y fecha.</p>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Cargando…' : 'Cargar'}</button>
        </div>
      </form>
    </Modal>
  );
}
