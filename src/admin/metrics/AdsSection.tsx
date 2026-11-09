import { useEffect, useMemo, useState } from 'react';
import { Modal, Pill } from '../ui';
import InfoTip, { WithTip } from '../../components/InfoTip';
import { fmtDate } from '../../lib/format';
import { fmt, type Fmt } from './defs';
import { Funnel } from './charts';
import { derive, fetchCreatives, type Creative, type MetaInsights, type MetaNode, type MetaState } from './meta';

/** Aviso cuando Meta no está conectado: el resto del panel sigue andando. */
export function MetaNotice({ meta }: { meta: MetaState }) {
  if (meta.kind === 'ok') return null;
  if (meta.kind === 'falta')
    return <div className="glass panel mx__notice">Falta conectar Meta Ads: cargá {meta.falta.map((f) => <code key={f}>{f}</code>).reduce((a, b) => <>{a} y {b}</>)} en Supabase → Edge Functions → Secrets.</div>;
  if (meta.kind === 'sin_funcion') return <div className="glass panel mx__notice">La conexión con Meta Ads todavía no está activa (falta desplegar la función <code>meta-ads</code>).</div>;
  return <div className="glass panel mx__notice text-warn">No se pudieron traer los datos de Meta: {meta.error}</div>;
}

// ---------- Cómo baja el tráfico ----------

export function TrafficSection({ meta }: { meta: MetaState }) {
  if (meta.kind !== 'ok') return <MetaNotice meta={meta} />;
  const t = meta.data.total;
  const steps = [
    { key: 'impressions', label: 'Impresiones', tip: 'Veces que se mostraron los anuncios.', value: t.impressions },
    { key: 'clicks', label: 'Clics al link', tip: 'Clics en el link del anuncio.', value: t.clicks },
    { key: 'lpv', label: 'Visitas a la landing', tip: 'Cargas de la landing que registra el píxel de Meta.', value: t.lpv },
    { key: 'optins', label: 'Opt-ins', tip: 'Registros que vinieron de un anuncio.', value: t.optins },
    { key: 'calificados', label: 'Calificados', tip: 'Registros de pauta que invierten 100 dólares por día o más.', value: t.calificados },
    { key: 'grupo', label: 'Entran al grupo', tip: 'Registros de pauta que entraron al grupo de WhatsApp. Se compara con los opt-ins: al grupo entran también los que no califican.', value: t.grupo, of: 'optins', ofLabel: 'los opt-ins' },
  ];
  return (
    <div className="glass panel">
      <Funnel steps={steps.map((s) => ({ key: s.key, value: s.value, of: (s as { of?: string }).of, ofLabel: (s as { ofLabel?: string }).ofLabel, label: <WithTip tip={s.tip}>{s.label}</WithTip> }))} />
    </div>
  );
}

// ---------- Anuncios ----------

type Level = 'campana' | 'conjunto' | 'anuncio';
type Filter = 'todos' | 'activos' | 'apagados';
interface Col { key: string; label: string; fmt: Fmt | 'entrega'; tip: string; def: boolean; value: (n: Row) => number | string | null }
type Row = MetaNode & ReturnType<typeof derive>;

const COLS: Col[] = [
  { key: 'entrega', label: 'Entrega', fmt: 'entrega', tip: 'Estado de entrega en Meta: Activo, En revisión, Rechazado, Con problemas o Apagado.', def: true, value: (n) => n.entrega },
  { key: 'presupuesto_diario', label: 'Presupuesto diario', fmt: 'usd', tip: 'Presupuesto diario de la campaña o del conjunto.', def: true, value: (n) => n.presupuesto_diario },
  { key: 'spend', label: 'Importe gastado', fmt: 'usd', tip: 'Lo gastado en el período.', def: true, value: (n) => n.spend },
  { key: 'optins', label: 'Opt-ins', fmt: 'num', tip: 'Registros que cruzaron con este anuncio.', def: true, value: (n) => n.optins },
  { key: 'calificados', label: 'Calificados', fmt: 'num', tip: 'Registros que invierten 100 dólares por día o más.', def: false, value: (n) => n.calificados },
  { key: 'cpl', label: 'CPL', fmt: 'usd2', tip: 'Inversión sobre opt-ins.', def: true, value: (n) => n.cpl },
  { key: 'cpl_calificado', label: 'CPL calificado', fmt: 'usd2', tip: 'Inversión sobre calificados.', def: true, value: (n) => n.cpl_calificado },
  { key: 'pct_calificado', label: '% calificado', fmt: 'pct', tip: 'Calificados sobre opt-ins.', def: true, value: (n) => n.pct_calificado },
  { key: 'pct_grupo', label: '% que entra al grupo', fmt: 'pct', tip: 'Entraron al grupo de WhatsApp sobre opt-ins.', def: true, value: (n) => n.pct_grupo },
  { key: 'ctr', label: 'CTR link', fmt: 'pct', tip: 'Clics al link sobre impresiones.', def: true, value: (n) => n.ctr },
  { key: 'cpm', label: 'CPM', fmt: 'usd2', tip: 'Inversión por cada 1.000 impresiones.', def: false, value: (n) => n.cpm },
  { key: 'clic_landing', label: 'Clic → landing', fmt: 'pct', tip: 'Visitas a la landing sobre clics al link.', def: false, value: (n) => n.clic_landing },
  { key: 'conversion', label: 'Conversión de la landing', fmt: 'pct', tip: 'Opt-ins sobre visitas a la landing.', def: false, value: (n) => n.conversion },
  { key: 'frequency', label: 'Frecuencia', fmt: 'x', tip: 'Veces promedio que cada persona vio el anuncio.', def: false, value: (n) => n.frequency },
  { key: 'agendas', label: 'Agendas', fmt: 'num', tip: 'Registros de este anuncio que agendaron una call.', def: true, value: (n) => n.agendas },
  { key: 'ventas', label: 'Ventas', fmt: 'num', tip: 'Registros de este anuncio que compraron.', def: true, value: (n) => n.ventas },
];
const COLS_KEY = 'metricas-anuncios-columnas';
const ENTREGA_TONE = { Activo: 'ok', 'En revisión': 'accent', Rechazado: 'warn', 'Con problemas': 'warn', Apagado: 'muted' } as const;

function readCols(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(COLS_KEY) ?? 'null');
    if (Array.isArray(v)) return v.filter((k) => COLS.some((c) => c.key === k));
  } catch {
    /* sin storage */
  }
  return COLS.filter((c) => c.def).map((c) => c.key);
}

const withDerived = (n: MetaNode): Row => ({ ...n, ...derive(n) });

export function AdsSection({ meta }: { meta: MetaState }) {
  const [level, setLevel] = useState<Level>('campana');
  const [filter, setFilter] = useState<Filter>('todos');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: 'spend', desc: true });
  const [cols, setCols] = useState<string[]>(readCols);
  const [colsOpen, setColsOpen] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [leadsOf, setLeadsOf] = useState<Row | null>(null);
  const [creatives, setCreatives] = useState<Record<string, Creative>>({});

  useEffect(() => {
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify(cols));
    } catch {
      /* sin storage */
    }
  }, [cols]);
  const ok = meta.kind === 'ok';
  useEffect(() => {
    if (ok) fetchCreatives().then(setCreatives).catch(() => setCreatives({}));
  }, [ok]);

  if (meta.kind !== 'ok') return <MetaNotice meta={meta} />;
  return (
    <AdsTable data={meta.data} level={level} setLevel={setLevel} filter={filter} setFilter={setFilter} query={query} setQuery={setQuery}
      sort={sort} setSort={setSort} cols={cols} setCols={setCols} colsOpen={colsOpen} setColsOpen={setColsOpen}
      open={open} setOpen={setOpen} leadsOf={leadsOf} setLeadsOf={setLeadsOf} creatives={creatives} />
  );
}

function AdsTable(p: {
  data: MetaInsights; level: Level; setLevel: (l: Level) => void; filter: Filter; setFilter: (f: Filter) => void;
  query: string; setQuery: (q: string) => void; sort: { key: string; desc: boolean }; setSort: (s: { key: string; desc: boolean }) => void;
  cols: string[]; setCols: (c: string[]) => void; colsOpen: boolean; setColsOpen: (o: boolean) => void;
  open: Set<string>; setOpen: (s: Set<string>) => void; leadsOf: Row | null; setLeadsOf: (r: Row | null) => void; creatives: Record<string, Creative>;
}) {
  const { data } = p;
  const camps = useMemo(() => data.campanas.map(withDerived), [data]);
  const sets = useMemo(() => data.conjuntos.map(withDerived), [data]);
  const ads = useMemo(() => data.anuncios.map(withDerived), [data]);
  const shown = COLS.filter((c) => p.cols.includes(c.key));
  const q = p.query.trim().toLowerCase();

  const pass = (r: Row) =>
    (p.filter === 'todos' || (p.filter === 'activos' ? r.entrega === 'Activo' : r.entrega !== 'Activo')) &&
    (!q || r.nombre.toLowerCase().includes(q));
  const sorter = (a: Row, b: Row) => {
    const col = COLS.find((c) => c.key === p.sort.key);
    const va = col ? col.value(a) : a.nombre;
    const vb = col ? col.value(b) : b.nombre;
    const na = va === null ? -Infinity : va;
    const nb = vb === null ? -Infinity : vb;
    const cmp = typeof na === 'string' || typeof nb === 'string' ? String(na).localeCompare(String(nb)) : (na as number) - (nb as number);
    return p.sort.desc ? -cmp : cmp;
  };
  const top = (p.level === 'campana' ? camps : p.level === 'conjunto' ? sets : ads).filter(pass).sort(sorter);
  // Al desplegar se ven los hijos con el mismo filtro de estado (la búsqueda aplica al nivel elegido).
  const byState = (r: Row) => p.filter === 'todos' || (p.filter === 'activos' ? r.entrega === 'Activo' : r.entrega !== 'Activo');
  const childrenOf = (r: Row, lvl: Level): [Row[], Level] | null => {
    if (lvl === 'campana') return [sets.filter((x) => x.campaign_id === r.id && byState(x)).sort(sorter), 'conjunto'];
    if (lvl === 'conjunto') return [ads.filter((x) => x.adset_id === r.id && byState(x)).sort(sorter), 'anuncio'];
    return null;
  };
  const toggle = (id: string) => {
    const n = new Set(p.open);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    p.setOpen(n);
  };
  const total = withDerived({ ...data.total, id: 'total', nombre: 'Total de la cuenta', entrega: 'Activo', estado: '', presupuesto_diario: null, agendas: ads.reduce((s, a) => s + a.agendas, 0) + data.sin_cruzar.agendas, ventas: ads.reduce((s, a) => s + a.ventas, 0) + data.sin_cruzar.ventas } as MetaNode);

  const cell = (r: Row, c: Col) => {
    if (c.fmt === 'entrega') return r.id === 'total' ? '' : <Pill tone={ENTREGA_TONE[r.entrega]}>{r.entrega}</Pill>;
    return fmt(c.value(r), c.fmt);
  };
  const rows: { r: Row; lvl: Level; depth: number }[] = [];
  const walk = (list: Row[], lvl: Level, depth: number) => {
    for (const r of list) {
      rows.push({ r, lvl, depth });
      if (p.open.has(r.id)) {
        const ch = childrenOf(r, lvl);
        if (ch) walk(ch[0], ch[1], depth + 1);
      }
    }
  };
  walk(top, p.level, 0);

  return (
    <>
      <div className="toolbar">
        <div className="filters" style={{ marginBottom: 0 }}>
          <div className="seg">
            {([['campana', 'Campañas'], ['conjunto', 'Conjuntos'], ['anuncio', 'Anuncios']] as [Level, string][]).map(([k, l]) => (
              <button key={k} type="button" className={`seg__opt${p.level === k ? ' is-on' : ''}`} onClick={() => p.setLevel(k)}>{l}</button>
            ))}
          </div>
          <div className="seg">
            {([['todos', 'Todos'], ['activos', 'Activos'], ['apagados', 'Apagados']] as [Filter, string][]).map(([k, l]) => (
              <button key={k} type="button" className={`seg__opt${p.filter === k ? ' is-on' : ''}`} onClick={() => p.setFilter(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="toolbar__right">
          <input className="field field--search" type="search" placeholder="Buscar por nombre…" value={p.query} onChange={(e) => p.setQuery(e.target.value)} />
          <div className="mx__colsmenu">
            <button className="btn btn--ghost" onClick={() => p.setColsOpen(!p.colsOpen)} aria-expanded={p.colsOpen}>Columnas</button>
            {p.colsOpen && (
              <div className="mx__colslist glass">
                {COLS.map((c) => (
                  <label key={c.key} className="check">
                    <input type="checkbox" checked={p.cols.includes(c.key)} onChange={(e) => p.setCols(e.target.checked ? [...p.cols, c.key] : p.cols.filter((k) => k !== c.key))} /> {c.label}
                  </label>
                ))}
                <button type="button" className="link link--btn" onClick={() => p.setCols(COLS.filter((c) => c.def).map((c) => c.key))}>Volver a las de siempre</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="glass table-wrap">
        <table className="table table--num mx__ads">
          <thead>
            <tr>
              <th><button type="button" className="mx__sort" onClick={() => p.setSort({ key: 'nombre', desc: p.sort.key === 'nombre' ? !p.sort.desc : false })}>Nombre{p.sort.key === 'nombre' ? (p.sort.desc ? ' ↓' : ' ↑') : ''}</button></th>
              {shown.map((c) => (
                <th key={c.key}>
                  <span className="with-tip">
                    <button type="button" className="mx__sort" onClick={() => p.setSort({ key: c.key, desc: p.sort.key === c.key ? !p.sort.desc : true })}>
                      {c.label}{p.sort.key === c.key ? (p.sort.desc ? ' ↓' : ' ↑') : ''}
                    </button>
                    <InfoTip text={c.tip} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="mx__total">
              <td><WithTip tip="Totales de la cuenta en el período, según Meta. Los opt-ins incluyen los que no cruzaron con ningún anuncio.">Total de la cuenta</WithTip></td>
              {shown.map((c) => <td key={c.key}>{cell(total, c)}</td>)}
            </tr>
            {rows.map(({ r, lvl, depth }) => {
              const canOpen = lvl !== 'anuncio';
              const cr = lvl === 'anuncio' ? p.creatives[r.id] : undefined;
              return (
                <tr key={`${lvl}-${r.id}`} className={lvl === 'anuncio' ? 'table__row' : undefined} onClick={lvl === 'anuncio' ? () => p.setLeadsOf(r) : undefined}>
                  <td>
                    <div className="mx__name" style={{ paddingLeft: depth * 18 }}>
                      {canOpen && <button type="button" className="icon-btn mx__caret" aria-label={p.open.has(r.id) ? 'Cerrar' : 'Abrir'} onClick={(e) => { e.stopPropagation(); toggle(r.id); }}>{p.open.has(r.id) ? '▾' : '▸'}</button>}
                      {cr?.miniatura && <img className="mx__thumb" src={cr.miniatura} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                      <span>{r.nombre || r.id}</span>
                    </div>
                  </td>
                  {shown.map((c) => <td key={c.key}>{cell(r, c)}</td>)}
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={shown.length + 1} className="muted">No hay {p.level === 'campana' ? 'campañas' : p.level === 'conjunto' ? 'conjuntos' : 'anuncios'} con este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted mx__note">
        <WithTip tip="Registros de pauta que no se pudieron unir a un anuncio: sin ad_id ni utm_content, con un anuncio que no está en la cuenta, o con un nombre repetido que no se pudo desempatar.">Sin cruzar</WithTip>:{' '}
        {data.sin_cruzar.optins} opt-ins ({data.sin_cruzar.motivos.sin_datos} sin datos, {data.sin_cruzar.motivos.no_encontrado} no encontrados, {data.sin_cruzar.motivos.ambiguo} ambiguos)
        {data.sin_cruzar.optins > 0 && <> · <button type="button" className="link link--btn" onClick={() => p.setLeadsOf(withDerived({ ...data.sin_cruzar, id: 'sin', nombre: 'Sin cruzar', entrega: 'Apagado', estado: '', presupuesto_diario: null, spend: 0, impressions: 0, reach: 0, frequency: null, clicks: 0, lpv: 0 } as MetaNode))}>Ver leads</button></>}
        {' '}· Datos de Meta {data.cache ? 'del caché' : 'recién traídos'} ({fmtDate(data.actualizado)} {new Date(data.actualizado).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}).
      </p>
      {p.leadsOf && <AdLeads ad={p.leadsOf} data={data} creative={p.creatives[p.leadsOf.id]} onClose={() => p.setLeadsOf(null)} />}
    </>
  );
}

function AdLeads({ ad, data, creative, onClose }: { ad: Row; data: MetaInsights; creative?: Creative; onClose: () => void }) {
  const leads = (ad.lead_ids ?? []).map((id) => ({ id, ...data.leads[id] })).filter((l) => l.nombre !== undefined).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <Modal title={ad.nombre || 'Anuncio'} onClose={onClose} wide>
      {creative?.miniatura && <img className="mx__preview" src={creative.imagen || creative.miniatura} alt="" referrerPolicy="no-referrer" />}
      <p className="muted">{leads.length} opt-ins · {ad.calificados} calificados · {ad.ventas} ventas</p>
      {leads.length === 0 ? <p className="muted">Este anuncio no tiene registros en el período.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nombre</th><th>Fecha</th><th>Inversión</th><th>Stage</th><th>Califica</th><th>Compró</th></tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>{l.nombre || '—'}</td>
                  <td>{fmtDate(l.fecha)}</td>
                  <td>{l.inversion ?? '—'}</td>
                  <td>{l.stage}</td>
                  <td>{l.califica ? <Pill tone="ok">Sí</Pill> : <span className="muted">No</span>}</td>
                  <td>{l.compro ? <Pill tone="ok">Sí</Pill> : <span className="muted">No</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
