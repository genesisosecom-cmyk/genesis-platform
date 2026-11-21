import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { fmtDate, fmtMoney } from '../../lib/format';
import { EmptyState, Field, Kpi, Modal, Pill, State } from '../ui';
import { useFunnels } from '../../funnels/FunnelContext';
import {
  addDaysISO,
  CUTS,
  deletePiece,
  fetchContentResults,
  fetchKeywordResults,
  fetchMetrics,
  fetchPieces,
  fetchSubavatarResults,
  fetchWeeks,
  FORMATS,
  isoDay,
  JOBS,
  labelOf,
  METRIC_FIELDS,
  mondayOf,
  PAINS,
  PIECE_STATUSES,
  PIECE_SUBAVATARS,
  saveMetric,
  savePiece,
  saveWeek,
  type ContentMetric,
  type ContentPiece,
  type ContentResult,
  type ContentWeek,
  type PieceInput,
  type PieceStatus,
} from '../../funnels/api';

type View = 'semana' | 'lista' | 'resultados';
const VIEWS: [View, string][] = [['semana', 'Semana'], ['lista', 'Lista'], ['resultados', 'Resultados']];
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
/** Filas de la grilla semanal: un renglón por formato (los parecidos van juntos). */
const ROWS: [string, string[]][] = [
  ['YouTube', ['youtube', 'flywheel']],
  ['Reel + ManyChat', ['reel']],
  ['Trial reels', ['trial_reel']],
  ['Historias', ['historias']],
  ['TikTok', ['tiktok']],
  ['Clips / Shorts', ['short']],
  ['Otros', ['mail', 'whatsapp', 'post', 'otro']],
];
const STATUS_TONE: Record<PieceStatus, 'ok' | 'warn' | 'muted' | 'accent'> = { idea: 'muted', guion: 'muted', grabado: 'accent', editado: 'accent', programado: 'accent', publicado: 'ok', descartado: 'warn' };

/** Día local (AAAA-MM-DD) en que sale una pieza. */
const dayOf = (p: ContentPiece) => (p.publish_at ? isoDay(new Date(p.publish_at)) : null);
const timeOf = (p: ContentPiece) => (p.publish_at ? new Date(p.publish_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
/** Lecturas que ya tocan (48 h, 7 días) y todavía no se cargaron. */
const dueCuts = (p: ContentPiece, metrics: ContentMetric[], now = Date.now()) =>
  p.status !== 'publicado' || !p.publish_at
    ? []
    : CUTS.filter(([cut, , days]) => cut !== '30d' && now - Date.parse(p.publish_at!) >= days * 86400000 && !metrics.some((m) => m.piece_id === p.id && m.cut === cut));

/**
 * Registro de contenido del funnel: cada pieza con su subavatar, dolor, palabra y métricas.
 * Semana (grilla lunes a domingo por formato, con el hilo y el pedido), Lista y Resultados.
 */
export default function ContentPiecesPage() {
  const { funnelId, funnels, launch, loading: fLoading } = useFunnels();
  // El contenido cuelga de un funnel. Con «Todos» se muestran las piezas de todos; al crear, va al primero que no es webinar.
  const scope = funnelId === 'all' ? null : funnelId;
  const target = scope ?? funnels.find((f) => f.kind !== 'webinar')?.id ?? funnels[0]?.id ?? null;
  const { data, loading, error, reload } = useAsync(() => Promise.all([fetchWeeks(scope), fetchPieces(scope), fetchMetrics(), fetchContentResults(scope)]), [scope]);
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.find(([v]) => v === params.get('v'))?.[0] ?? 'semana') as View;
  const setView = (v: View) => setParams(v === 'semana' ? {} : { v }, { replace: true });
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState<Partial<PieceInput> | null>(null);

  const [weeks = [], pieces = [], metrics = [], results = []] = data ?? [];
  const current = open ? pieces.find((p) => p.id === open) ?? null : null;
  const pending = pieces.filter((p) => dueCuts(p, metrics).length > 0);

  return (
    <State loading={loading || fLoading} error={error}>
      <div className="toolbar">
        <div className="chips">
          {VIEWS.map(([v, l]) => <button key={v} className={`chip${view === v ? ' is-active' : ''}`} onClick={() => setView(v)}>{l}</button>)}
        </div>
        <div className="toolbar__right">
          {pending.length > 0 && <Pill tone="warn">{pending.length} lectura(s) pendiente(s)</Pill>}
          <button className="btn btn--primary" disabled={!target} onClick={() => setCreating({})}>+ Nueva pieza</button>
        </div>
      </div>

      {view === 'semana' && target && (
        <WeekView funnelId={target} weeks={weeks} pieces={pieces} metrics={metrics} onOpen={setOpen} onCreate={setCreating} onSaved={reload} />
      )}
      {view === 'lista' && <ListView pieces={pieces} metrics={metrics} results={results} onOpen={setOpen} />}
      {view === 'resultados' && <ResultsView funnelId={target} pieces={pieces} results={results} onOpen={setOpen} />}

      {(current || creating) && target && (
        <PieceModal
          key={current?.id ?? 'new'}
          piece={current}
          defaults={{ funnel_id: target, launch_id: launch && launch.funnel_id === target ? launch.id : null, ...creating }}
          weeks={weeks}
          pieces={pieces}
          metrics={metrics.filter((m) => m.piece_id === current?.id)}
          result={results.find((r) => r.piece_id === current?.id) ?? null}
          onClose={() => { setOpen(null); setCreating(null); }}
          onChanged={reload}
        />
      )}
    </State>
  );
}

// ---------------------------------------------------------------- Semana

function WeekView({ funnelId, weeks, pieces, metrics, onOpen, onCreate, onSaved }: {
  funnelId: string;
  weeks: ContentWeek[];
  pieces: ContentPiece[];
  metrics: ContentMetric[];
  onOpen: (id: string) => void;
  onCreate: (defaults: Partial<PieceInput>) => void;
  onSaved: () => void;
}) {
  const [start, setStart] = useState(() => mondayOf(new Date()));
  const week = weeks.find((w) => w.week_start === start && w.funnel_id === funnelId) ?? null;
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
  const today = isoDay(new Date());
  const inWeek = pieces.filter((p) => { const d = dayOf(p); return d !== null && d >= days[0] && d <= days[6]; });
  // Las piezas atadas a la semana pero que salen el fin de semana anterior (la semana puente arranca un sábado).
  const before = pieces.filter((p) => week && p.week_id === week.id && (dayOf(p) ?? '9') < days[0]);
  const rows = ROWS.filter(([, formats], i) => i < 4 || inWeek.some((p) => formats.includes(p.format)));

  return (
    <>
      <div className="filters">
        <button className="btn btn--ghost btn--sm" onClick={() => setStart(addDaysISO(start, -7))}>← Anterior</button>
        <strong>Semana del {fmtDate(start)} al {fmtDate(days[6])}</strong>
        <button className="btn btn--ghost btn--sm" onClick={() => setStart(addDaysISO(start, 7))}>Siguiente →</button>
        {start !== mondayOf(new Date()) && <button className="link link--btn" onClick={() => setStart(mondayOf(new Date()))}>Hoy</button>}
        <span className="muted">{inWeek.length} pieza(s) · {inWeek.filter((p) => p.status === 'publicado').length} publicada(s)</span>
      </div>

      <WeekHeader key={`${funnelId}|${start}|${week?.id ?? ''}`} funnelId={funnelId} start={start} week={week} onSaved={onSaved} />

      {before.length > 0 && (
        <p className="muted">
          Antes del lunes: {before.map((p, i) => (
            <span key={p.id}>{i > 0 && ' · '}<button className="link link--btn" onClick={() => onOpen(p.id)}>{fmtDate(p.publish_at)} {labelOf(FORMATS, p.format)}: {p.title.slice(0, 50)}</button></span>
          ))}
        </p>
      )}

      <div className="cweek glass">
        <div className="cweek__corner" />
        {days.map((d, i) => (
          <div key={d} className={`cweek__day${d === today ? ' is-today' : ''}`}>{DAYS[i]} <span className="muted">{d.slice(8)}/{d.slice(5, 7)}</span></div>
        ))}
        {rows.map(([label, formats]) => (
          <div key={label} className="cweek__row">
            <div className="cweek__label">{label}</div>
            {days.map((d) => {
              const cell = inWeek.filter((p) => formats.includes(p.format) && dayOf(p) === d).sort((a, b) => (a.publish_at ?? '').localeCompare(b.publish_at ?? ''));
              return (
                <div key={d} className="cweek__cell">
                  {cell.map((p) => (
                    <button key={p.id} type="button" className={`cpiece cpiece--${p.status}`} onClick={() => onOpen(p.id)} title={p.title}>
                      <span className="cpiece__meta">{timeOf(p)}{p.subavatar ? ` · ${labelOf(PIECE_SUBAVATARS, p.subavatar)}` : ''}{p.keyword ? ` · ${p.keyword}` : ''}{dueCuts(p, metrics).length ? ' · ⏱' : ''}</span>
                      <span className="cpiece__title">{p.title}</span>
                    </button>
                  ))}
                  <button type="button" className="cweek__add" aria-label={`Nueva pieza: ${label}, ${d}`} onClick={() => onCreate({ format: formats[0], publish_at: new Date(`${d}T12:00:00`).toISOString(), week_id: week?.id ?? null })}>+</button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

/** El hilo de la semana (el dolor en una frase), el pedido con su palabra y las notas del ritual del sábado. */
function WeekHeader({ funnelId, start, week, onSaved }: { funnelId: string; start: string; week: ContentWeek | null; onSaved: () => void }) {
  const [v, setV] = useState({ pain: week?.pain ?? null, subavatar: week?.subavatar ?? '', thread: week?.thread ?? '', ask: week?.ask ?? '', ritual_notes: week?.ritual_notes ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = v.pain !== (week?.pain ?? null) || v.subavatar !== (week?.subavatar ?? '') || v.thread !== (week?.thread ?? '') || v.ask !== (week?.ask ?? '') || v.ritual_notes !== (week?.ritual_notes ?? '');
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveWeek({ funnel_id: funnelId, week_start: start, pain: v.pain, subavatar: v.subavatar || null, thread: v.thread, ask: v.ask, ritual_notes: v.ritual_notes });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="glass panel cweekhead">
      <div className="aform">
        <Field label="El hilo: el dolor de la semana en una frase" full>
          <textarea className="field field--area rfield" rows={2} value={v.thread} onChange={(e) => setV({ ...v, thread: e.target.value })} placeholder="Un dolor por semana" />
        </Field>
        <Field label="Dolor del mapa">
          <select className="field field--select" value={v.pain ?? ''} onChange={(e) => setV({ ...v, pain: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Sin definir</option>
            {PAINS.map((p) => <option key={p} value={p}>Dolor {p}</option>)}
          </select>
        </Field>
        <Field label="Subavatar de la semana">
          <select className="field field--select" value={v.subavatar} onChange={(e) => setV({ ...v, subavatar: e.target.value })}>
            <option value="">Sin definir</option>
            {PIECE_SUBAVATARS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="El pedido de la semana y su palabra" full>
          <textarea className="field field--area rfield" rows={2} value={v.ask} onChange={(e) => setV({ ...v, ask: e.target.value })} placeholder="Un solo pedido de conversación por semana (sábado)" />
        </Field>
        <Field label="Ritual del sábado: lo que salió" full>
          <textarea className="field field--area rfield" rows={2} value={v.ritual_notes} onChange={(e) => setV({ ...v, ritual_notes: e.target.value })} placeholder="Dolor de la semana siguiente, con 3 frases textuales del setter y del closer" />
        </Field>
        {error && <p className="login__error afield--full">{error}</p>}
        {dirty && (
          <div className="aform__actions afield--full">
            <button className="btn btn--primary btn--sm" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar la semana'}</button>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Lista

function ListView({ pieces, metrics, results, onOpen }: { pieces: ContentPiece[]; metrics: ContentMetric[]; results: ContentResult[]; onOpen: (id: string) => void }) {
  const [format, setFormat] = useState('all');
  const [sub, setSub] = useState('all');
  const [pain, setPain] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const q = query.trim().toLowerCase();
  const rows = pieces
    .filter(
      (p) =>
        (format === 'all' || p.format === format) &&
        (sub === 'all' || p.subavatar === sub) &&
        (pain === 'all' || String(p.pain) === pain) &&
        (status === 'all' || p.status === status) &&
        (!dueOnly || dueCuts(p, metrics).length > 0) &&
        (!q || `${p.title} ${p.keyword ?? ''} ${p.notes} ${p.source_video ?? ''}`.toLowerCase().includes(q)),
    )
    .sort((a, b) => (b.publish_at ?? '').localeCompare(a.publish_at ?? ''));
  const res = (id: string) => results.find((r) => r.piece_id === id);
  const m = (id: string, cut: ContentMetric['cut']) => metrics.find((x) => x.piece_id === id && x.cut === cut);

  return (
    <>
      <div className="filters">
        <select className="field field--select" value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Formato">
          <option value="all">Todos los formatos</option>
          {FORMATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="field field--select" value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Subavatar">
          <option value="all">Todos los subavatares</option>
          {PIECE_SUBAVATARS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="field field--select" value={pain} onChange={(e) => setPain(e.target.value)} aria-label="Dolor">
          <option value="all">Todos los dolores</option>
          {PAINS.map((p) => <option key={p} value={p}>Dolor {p}</option>)}
        </select>
        <select className="field field--select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado">
          <option value="all">Todos los estados</option>
          {PIECE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" className={`chip${dueOnly ? ' is-active' : ''}`} onClick={() => setDueOnly((d) => !d)}>Lecturas pendientes</button>
        <input className="field field--search" type="search" placeholder="Buscar hook, palabra…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {!rows.length ? <EmptyState title="Ninguna pieza coincide" text="Probá con otros filtros o creá una pieza nueva." /> : (
        <div className="glass table-wrap">
          <table className="table">
            <thead><tr><th>Sale</th><th>Formato</th><th>Pieza</th><th>Sub</th><th>Dolor</th><th>Palabra</th><th>Estado</th><th>Vistas 48 h</th><th>Vistas 7 d</th><th>Conv.</th><th>Calif.</th></tr></thead>
            <tbody>
              {rows.slice(0, 400).map((p) => (
                <tr key={p.id} className="table__row" onClick={() => onOpen(p.id)}>
                  <td>{p.publish_at ? <>{fmtDate(p.publish_at)}<div className="cell-sub">{timeOf(p)}</div></> : <span className="muted">Sin fecha</span>}</td>
                  <td>{labelOf(FORMATS, p.format)}<div className="cell-sub">{p.job ? labelOf(JOBS, p.job) : ''}</div></td>
                  <td className="cell-clip"><div className="cell-main">{p.title}</div>{p.source_video && <div className="cell-sub">De: {p.source_video}</div>}</td>
                  <td>{p.subavatar ? labelOf(PIECE_SUBAVATARS, p.subavatar) : <span className="muted">—</span>}</td>
                  <td>{p.pain ?? <span className="muted">—</span>}</td>
                  <td>{p.keyword ?? <span className="muted">—</span>}</td>
                  <td><Pill tone={STATUS_TONE[p.status]}>{p.status}</Pill>{dueCuts(p, metrics).length > 0 && <div className="cell-sub text-warn">Falta leer {dueCuts(p, metrics).map(([, l]) => l).join(' y ')}</div>}</td>
                  <td>{m(p.id, '48h')?.views?.toLocaleString('es-AR') ?? <span className="muted">—</span>}</td>
                  <td>{m(p.id, '7d')?.views?.toLocaleString('es-AR') ?? <span className="muted">—</span>}</td>
                  <td>{res(p.id)?.conversaciones || <span className="muted">0</span>}</td>
                  <td>{res(p.id)?.calificadas || <span className="muted">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Resultados

function ResultsTable({ head, rows }: { head: string; rows: { key: string; label: React.ReactNode; onClick?: () => void; r: { conversaciones: number; calificadas: number; aplicaciones: number; llamadas: number; ventas: number; caja: number } }[] }) {
  if (!rows.length) return <p className="muted">Todavía no hay conversaciones para mostrar.</p>;
  return (
    <div className="glass table-wrap">
      <table className="table table--num">
        <thead><tr><th>{head}</th><th>Conversaciones</th><th>Calificadas</th><th>Aplicaciones</th><th>Llamadas</th><th>Ventas</th><th>Caja</th></tr></thead>
        <tbody>
          {rows.map(({ key, label, onClick, r }) => (
            <tr key={key} className={onClick ? 'table__row' : undefined} onClick={onClick}>
              <td>{label}</td>
              <td>{r.conversaciones}</td>
              <td>{r.calificadas}{r.conversaciones ? <span className="muted"> · {Math.round((r.calificadas / r.conversaciones) * 100)}%</span> : null}</td>
              <td>{r.aplicaciones}</td>
              <td>{r.llamadas}</td>
              <td>{r.ventas}</td>
              <td>{fmtMoney(Number(r.caja), 'USD')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Por pieza, por palabra y por subavatar. Nada se carga a mano: sale de qué pieza y qué palabra trajo a cada lead. */
function ResultsView({ funnelId, pieces, results, onOpen }: { funnelId: string | null; pieces: ContentPiece[]; results: ContentResult[]; onOpen: (id: string) => void }) {
  const extra = useAsync(() => (funnelId ? Promise.all([fetchKeywordResults(funnelId), fetchSubavatarResults(funnelId)]) : Promise.resolve(null)), [funnelId]);
  const [byWeek, setByWeek] = useState(false);
  const [kw = [], subs = []] = extra.data ?? [];
  const sum = <T extends { conversaciones: number; calificadas: number; aplicaciones: number; llamadas: number; ventas: number; caja: number }>(list: T[]) =>
    list.reduce((a, r) => ({ conversaciones: a.conversaciones + Number(r.conversaciones), calificadas: a.calificadas + Number(r.calificadas), aplicaciones: a.aplicaciones + Number(r.aplicaciones), llamadas: a.llamadas + Number(r.llamadas), ventas: a.ventas + Number(r.ventas), caja: a.caja + Number(r.caja) }), { conversaciones: 0, calificadas: 0, aplicaciones: 0, llamadas: 0, ventas: 0, caja: 0 });
  const keywords = useMemo(() => [...new Set(kw.map((k) => k.keyword))].map((k) => ({ keyword: k, total: sum(kw.filter((x) => x.keyword === k)) })).sort((a, b) => b.total.conversaciones - a.total.conversaciones), [kw]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = sum(subs);
  const withResults = results.filter((r) => Number(r.conversaciones) > 0).sort((a, b) => Number(b.calificadas) - Number(a.calificadas) || Number(b.conversaciones) - Number(a.conversaciones));
  const piece = (id: string) => pieces.find((p) => p.id === id);

  return (
    <State loading={extra.loading} error={extra.error}>
      <div className="kpis kpis--4">
        <Kpi label="Conversaciones" value={total.conversaciones} />
        <Kpi label="Calificadas" value={total.calificadas} tone="ok" hint={total.conversaciones ? `${Math.round((total.calificadas / total.conversaciones) * 100)}% de las conversaciones` : undefined} />
        <Kpi label="Llamadas · ventas" value={`${total.llamadas} · ${total.ventas}`} />
        <Kpi label="Caja" value={fmtMoney(total.caja, 'USD')} />
      </div>

      <h2 className="section-title section-title--sm">Por subavatar</h2>
      <ResultsTable head="Subavatar" rows={subs.map((s) => ({ key: s.subavatar, label: <>{s.subavatar}{Number(s.ventas_lite) > 0 && <span className="muted"> · {s.ventas_lite} Lite</span>}</>, r: s }))} />

      <div className="toolbar" style={{ marginTop: 28 }}>
        <h2 className="section-title section-title--sm" style={{ margin: 0 }}>Por palabra</h2>
        <button type="button" className={`chip chip--sm${byWeek ? ' is-active' : ''}`} onClick={() => setByWeek((b) => !b)}>Semana por semana</button>
      </div>
      {byWeek
        ? <ResultsTable head="Palabra · semana" rows={kw.map((k) => ({ key: `${k.keyword}|${k.semana}`, label: <>{k.keyword} <span className="muted">· semana del {fmtDate(k.semana)}</span></>, r: k }))} />
        : <ResultsTable head="Palabra" rows={keywords.map((k) => ({ key: k.keyword, label: k.keyword, r: k.total }))} />}

      <h2 className="section-title section-title--sm" style={{ marginTop: 28 }}>Por pieza</h2>
      <ResultsTable head="Pieza" rows={withResults.map((r) => ({ key: r.piece_id, onClick: () => onOpen(r.piece_id), label: <><div className="cell-main">{piece(r.piece_id)?.title ?? '—'}</div><div className="cell-sub">{piece(r.piece_id) ? `${labelOf(FORMATS, piece(r.piece_id)!.format)} · ${fmtDate(piece(r.piece_id)!.publish_at)}` : ''}</div></>, r }))} />
      <p className="muted" style={{ marginTop: 12 }}>Una conversación cuenta para la pieza que figura como «la que lo trajo» en la ficha del lead (se resuelve sola por palabra y fecha, y el setter la puede corregir).</p>
    </State>
  );
}

// ---------------------------------------------------------------- Ficha de la pieza

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

function PieceModal({ piece, defaults, weeks, pieces, metrics, result, onClose, onChanged }: {
  piece: ContentPiece | null;
  defaults: Partial<PieceInput>;
  weeks: ContentWeek[];
  pieces: ContentPiece[];
  metrics: ContentMetric[];
  result: ContentResult | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const blank: Partial<PieceInput> = { format: 'reel', job: 'atraccion', title: '', status: 'idea', notes: '', responsible_name: '', ...defaults };
  const [v, setV] = useState<Partial<PieceInput>>(piece ?? blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PieceInput>(k: K, value: PieceInput[K] | null) => setV((s) => ({ ...s, [k]: value }));
  const str = (k: 'title' | 'keyword' | 'cta' | 'source_video' | 'variable' | 'url' | 'angle' | 'responsible_name' | 'notes') => (e: { target: { value: string } }) =>
    set(k, (k === 'keyword' ? e.target.value.toUpperCase() : e.target.value) || (k === 'title' || k === 'notes' || k === 'responsible_name' ? '' : null));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.title?.trim()) return setError('Falta el hook o título.');
    setBusy(true);
    setError(null);
    try {
      // La semana sale de la fecha (lunes de esa semana), si esa semana ya tiene su hilo cargado.
      const monday = v.publish_at ? mondayOf(new Date(v.publish_at)) : null;
      const week = weeks.find((w) => w.funnel_id === v.funnel_id && w.week_start === monday);
      const { id: _id, created_at: _c, updated_at: _u, ...fields } = v as ContentPiece;
      await savePiece(piece?.id ?? null, { ...fields, title: v.title.trim(), week_id: week?.id ?? (piece ? v.week_id ?? null : null) });
      onChanged();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!piece || !window.confirm(`¿Borrar la pieza «${piece.title.slice(0, 60)}»? Se borran también sus métricas.`)) return;
    setBusy(true);
    try {
      await deletePiece(piece.id);
      onChanged();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  const isTrial = v.format === 'trial_reel';

  return (
    <Modal title={piece ? piece.title.slice(0, 80) : 'Nueva pieza'} onClose={onClose} wide>
      <form className="aform" onSubmit={submit}>
        <Field label="Hook o título (textual) *" full><textarea className="field field--area rfield" rows={2} value={v.title ?? ''} onChange={str('title')} autoFocus={!piece} /></Field>
        <Field label="Formato">
          <select className="field field--select" value={v.format} onChange={(e) => set('format', e.target.value)}>{FORMATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        <Field label="Trabajo">
          <select className="field field--select" value={v.job ?? ''} onChange={(e) => set('job', e.target.value || null)}>
            <option value="">Sin definir</option>
            {JOBS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Sale (fecha y hora)"><input className="field" type="datetime-local" value={toLocal(v.publish_at ?? null)} onChange={(e) => set('publish_at', e.target.value ? new Date(e.target.value).toISOString() : null)} /></Field>
        <Field label="Estado">
          <select className="field field--select" value={v.status} onChange={(e) => set('status', e.target.value as PieceStatus)}>{PIECE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </Field>
        <Field label="Subavatar (uno por pieza)">
          <select className="field field--select" value={v.subavatar ?? ''} onChange={(e) => set('subavatar', e.target.value || null)}>
            <option value="">Sin definir</option>
            {PIECE_SUBAVATARS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Dolor del mapa">
          <select className="field field--select" value={v.pain ?? ''} onChange={(e) => set('pain', e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sin definir</option>
            {PAINS.map((p) => <option key={p} value={p}>Dolor {p}</option>)}
          </select>
        </Field>
        <Field label="Palabra (ManyChat)"><input className="field" value={v.keyword ?? ''} onChange={str('keyword')} placeholder="CUENTA, PISO…" /></Field>
        <Field label="Ángulo (A–I)"><input className="field" value={v.angle ?? ''} onChange={str('angle')} maxLength={20} /></Field>
        <Field label="CTA" full><input className="field" value={v.cta ?? ''} onChange={str('cta')} /></Field>
        <Field label="Sale de (video largo o momento)"><input className="field" value={v.source_video ?? ''} onChange={str('source_video')} placeholder="V2-a, VSL-09…" /></Field>
        <Field label="Responsable"><input className="field" value={v.responsible_name ?? ''} onChange={str('responsible_name')} /></Field>
        {isTrial && (
          <>
            <Field label="Pieza base del trial">
              <select className="field field--select" style={{ width: '100%' }} value={v.variant_of ?? ''} onChange={(e) => set('variant_of', e.target.value || null)}>
                <option value="">Sin pieza base</option>
                {pieces.filter((p) => p.id !== piece?.id && p.format !== 'trial_reel').map((p) => <option key={p.id} value={p.id}>{p.title.slice(0, 70)}</option>)}
              </select>
            </Field>
            <Field label="Variable que cambia (una sola)"><input className="field" value={v.variable ?? ''} onChange={str('variable')} placeholder="gancho, look, CTA…" /></Field>
          </>
        )}
        <Field label="Link de la pieza publicada" full>
          <div className="filters" style={{ marginBottom: 0 }}>
            <input className="field" style={{ flex: 1 }} type="url" value={v.url ?? ''} onChange={str('url')} placeholder="https://…" />
            {v.url && <a className="btn btn--ghost btn--sm" href={v.url} target="_blank" rel="noopener noreferrer">Abrir</a>}
          </div>
        </Field>
        <Field label="Notas" full><textarea className="field field--area rfield" rows={3} value={v.notes ?? ''} onChange={str('notes')} /></Field>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          {piece && <button type="button" className="btn btn--danger" style={{ marginRight: 'auto' }} onClick={remove} disabled={busy}>Borrar</button>}
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cerrar</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : piece ? 'Guardar' : 'Crear pieza'}</button>
        </div>
      </form>

      {piece && (
        <>
          {result && (
            <div className="kpis kpis--4" style={{ marginTop: 22 }}>
              <Kpi label="Conversaciones" value={result.conversaciones} />
              <Kpi label="Calificadas" value={result.calificadas} tone="ok" />
              <Kpi label="Aplicaciones · llamadas" value={`${result.aplicaciones} · ${result.llamadas}`} />
              <Kpi label="Ventas · caja" value={`${result.ventas} · ${fmtMoney(Number(result.caja), 'USD')}`} />
            </div>
          )}
          <PieceMetrics piece={piece} metrics={metrics} onSaved={onChanged} />
        </>
      )}
    </Modal>
  );
}

/** Lecturas de la pieza a 48 h, 7 y 30 días. */
function PieceMetrics({ piece, metrics, onSaved }: { piece: ContentPiece; metrics: ContentMetric[]; onSaved: () => void }) {
  const fields = METRIC_FIELDS.filter((f) => !f.formats || f.formats.includes(piece.format));
  const initial = () => Object.fromEntries(CUTS.map(([cut]) => [cut, Object.fromEntries(fields.map((f) => [f.key, metrics.find((m) => m.cut === cut)?.[f.key] ?? '']))])) as Record<string, Record<string, number | string>>;
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setV(initial()), [metrics.length, piece.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (cut: ContentMetric['cut']) => {
    setBusy(cut);
    setError(null);
    try {
      await saveMetric(piece.id, cut, Object.fromEntries(fields.map((f) => [f.key, v[cut][f.key] === '' ? null : Number(v[cut][f.key])])));
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section style={{ marginTop: 22 }}>
      <h3 className="section-title section-title--sm">Métricas</h3>
      <div className="table-wrap">
        <table className="table table--num cmetrics">
          <thead>
            <tr>
              <th>Lectura</th>
              {CUTS.map(([cut, label]) => {
                const m = metrics.find((x) => x.cut === cut);
                return <th key={cut}>{label}{m ? <div className="cell-sub">cargada el {fmtDate(m.measured_at)}</div> : <div className="cell-sub">sin cargar</div>}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.key}>
                <td>{f.label}</td>
                {CUTS.map(([cut]) => (
                  <td key={cut}><input className="field field--num" type="number" min="0" step="any" value={v[cut][f.key]} onChange={(e) => setV((s) => ({ ...s, [cut]: { ...s[cut], [f.key]: e.target.value } }))} aria-label={`${f.label} a ${cut}`} /></td>
                ))}
              </tr>
            ))}
            <tr>
              <td />
              {CUTS.map(([cut]) => <td key={cut}><button type="button" className="btn btn--ghost btn--sm" disabled={busy !== null} onClick={() => save(cut)}>{busy === cut ? 'Guardando…' : 'Guardar'}</button></td>)}
            </tr>
          </tbody>
        </table>
      </div>
      {error && <p className="state--error">{error}</p>}
    </section>
  );
}
