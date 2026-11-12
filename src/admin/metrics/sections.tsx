import { useMemo, useState, type ReactNode } from 'react';
import InfoTip, { WithTip } from '../../components/InfoTip';
import { fmtDate } from '../../lib/format';
import { INVESTMENT_LEVELS } from '../../crm/model';
import type { AdsMetrics, Summary } from './api';
import { FUNNEL_STEPS, SUMMARY, SUMMARY_KEY, fmt, trend, type Def } from './defs';
import { BarList, Funnel, LineChart, SERIES_COLORS, TrendArrow } from './charts';
import { derive, type MetaState } from './meta';

/** Título de sección con su ⓘ. */
export function SectionTitle({ id, children, tip }: { id: string; children: ReactNode; tip?: string }) {
  return <h2 className="section-title mx__title" id={id}><WithTip tip={tip}>{children}</WithTip></h2>;
}

/** Tarjeta de un número con ⓘ y flecha de hoy contra ayer. */
export function Stat({ def, value, today, yesterday, sub }: { def: Def; value: unknown; today?: unknown; yesterday?: unknown; sub?: ReactNode }) {
  return (
    <div className="glass kpi mx__stat">
      <span className="eyebrow with-tip">{def.label}<InfoTip text={def.tip} /></span>
      <span className="kpi__value">{fmt(value, def.fmt)}</span>
      <span className="mx__stat-foot">
        {today !== undefined && <TrendArrow t={trend(def, today, yesterday)} />}
        {sub && <span className="muted kpi__hint">{sub}</span>}
      </span>
    </div>
  );
}

// ---------- Métricas de Meta para «Cómo viene la pauta» ----------

const META_DEFS: Def[] = [
  { key: 'spend', label: 'Inversión', fmt: 'usd', tip: 'Lo gastado en Meta Ads en el período.' },
  { key: 'cpl', label: 'CPL', fmt: 'usd2', tip: 'Inversión sobre opt-ins de pauta (costo por registro).', up: false },
  { key: 'cpl_calificado', label: 'CPL calificado', fmt: 'usd2', tip: 'Inversión sobre calificados de pauta.', up: false },
  { key: 'cpm', label: 'CPM', fmt: 'usd2', tip: 'Inversión por cada 1.000 impresiones.', up: false },
  { key: 'ctr', label: 'CTR del link', fmt: 'pct', tip: 'Clics al link sobre impresiones.', up: true },
  { key: 'clic_landing', label: 'Clic → landing', fmt: 'pct', tip: 'Visitas a la landing (Meta) sobre clics al link.', up: true },
  { key: 'conversion', label: 'Conversión de la landing', fmt: 'pct', tip: 'Opt-ins de pauta sobre visitas a la landing que mide Meta.', up: true },
  { key: 'impressions', label: 'Impresiones', fmt: 'num', tip: 'Veces que se mostraron los anuncios.' },
  { key: 'reach', label: 'Alcance', fmt: 'num', tip: 'Personas distintas que vieron los anuncios.' },
  { key: 'frequency', label: 'Frecuencia', fmt: 'x', tip: 'Veces promedio que cada persona vio los anuncios.' },
  { key: 'clicks', label: 'Clics al link', fmt: 'num', tip: 'Clics en el link del anuncio.', up: true },
  { key: 'lpv', label: 'Visitas a la landing (Meta)', fmt: 'num', tip: 'Cargas de la landing que registra el píxel de Meta (landing_page_view).', up: true },
];

/** Una fila por día con todo junto: lo de la base + lo de Meta. */
function dailyRows(m: AdsMetrics, meta: MetaState) {
  const md = meta.kind === 'ok' ? new Map(meta.data.por_dia.map((d) => [d.dia, d])) : null;
  return m.por_dia.map((d) => {
    const x = md?.get(d.dia);
    const der = x ? derive({ ...x, optins: d.optins_pauta ?? 0, calificados: d.calificados_pauta ?? 0 }) : null;
    return { ...d, ...(x ?? {}), ...(der ?? {}) } as Record<string, unknown> & { dia: string };
  });
}

export function PautaSection({ m, meta }: { m: AdsMetrics; meta: MetaState }) {
  const rows = useMemo(() => dailyRows(m, meta), [m, meta]);
  const today = rows.find((r) => r.dia === m.hoy);
  const yest = rows.find((r) => r.dia === shift(m.hoy, -1));
  const defs = SUMMARY.filter((d) => SUMMARY_KEY.includes(d.key));
  const rest = SUMMARY.filter((d) => !SUMMARY_KEY.includes(d.key));
  const metaOk = meta.kind === 'ok' ? meta.data : null;
  const metaTotal = metaOk ? { ...metaOk.total, ...derive({ ...metaOk.total, optins: m.resumen.optins_pauta ?? 0, calificados: m.resumen.calificados_pauta ?? 0 }) } : null;
  const chartDefs = [...SUMMARY, ...(metaOk ? META_DEFS : [])];
  const [metric, setMetric] = useState('optins_pauta');
  const chartDef = chartDefs.find((d) => d.key === metric) ?? SUMMARY[1];
  const cols = [...SUMMARY, ...(metaOk ? META_DEFS.filter((d) => ['spend', 'cpl', 'cpl_calificado', 'cpm', 'ctr', 'clicks', 'lpv'].includes(d.key)) : [])];

  return (
    <>
      <div className="mx__stats">
        {defs.map((d) => (
          <Stat key={d.key} def={d} value={(m.resumen as Record<string, unknown>)[d.key]} today={today?.[d.key]} yesterday={yest?.[d.key]} />
        ))}
        {metaTotal && META_DEFS.slice(0, 3).map((d) => (
          <Stat key={d.key} def={d} value={(metaTotal as Record<string, unknown>)[d.key]} today={today?.[d.key]} yesterday={yest?.[d.key]} />
        ))}
      </div>
      <div className="glass panel">
        <dl className="kv mx__kv">
          {rest.map((d) => (
            <div key={d.key} className="kv__row">
              <dt><WithTip tip={d.tip}>{d.label}</WithTip></dt>
              <dd>{fmt((m.resumen as Record<string, unknown>)[d.key], d.fmt)} <TrendArrow t={trend(d, today?.[d.key], yest?.[d.key])} /></dd>
            </div>
          ))}
          {metaTotal && META_DEFS.slice(3).map((d) => (
            <div key={d.key} className="kv__row">
              <dt><WithTip tip={d.tip}>{d.label}</WithTip></dt>
              <dd>{fmt((metaTotal as Record<string, unknown>)[d.key], d.fmt)} <TrendArrow t={trend(d, today?.[d.key], yest?.[d.key])} /></dd>
            </div>
          ))}
          {metaOk && (
            <div className="kv__row">
              <dt><WithTip tip="Anuncios de las campañas activas según su estado de entrega en Meta (los de campañas pausadas no se cuentan).">Anuncios</WithTip></dt>
              <dd>{metaOk.estados.activos} activos · {metaOk.estados.en_revision} en revisión · {metaOk.estados.rechazados} rechazados{metaOk.estados.con_problemas ? ` · ${metaOk.estados.con_problemas} con problemas` : ''}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="glass panel">
        <div className="panel__head">
          <h3 className="panel__title"><WithTip tip={chartDef.tip}>Por día</WithTip></h3>
          <select className="field field--select mx__select" value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Métrica del gráfico">
            {chartDefs.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </div>
        <LineChart days={rows.map((r) => r.dia)} label={`${chartDef.label} por día`}
          series={[{ name: chartDef.label, color: SERIES_COLORS[1], values: rows.map((r) => (r[chartDef.key] === null || r[chartDef.key] === undefined ? null : Number(r[chartDef.key]))) }]}
          format={(v) => fmt(v, chartDef.fmt)} />
        <DayTable rows={rows} cols={cols} />
      </div>
    </>
  );
}

function DayTable({ rows, cols }: { rows: (Record<string, unknown> & { dia: string })[]; cols: Def[] }) {
  return (
    <div className="table-wrap mx__daytable">
      <table className="table table--num">
        <thead>
          <tr>
            <th>Día</th>
            {cols.map((c) => <th key={c.key}><WithTip tip={c.tip}>{c.label}</WithTip></th>)}
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((r) => (
            <tr key={r.dia}>
              <td className="mx__day">{shortDate(r.dia)}</td>
              {cols.map((c) => <td key={c.key}>{fmt(r[c.key], c.fmt)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const WEEKDAY = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const shortDate = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  return `${WEEKDAY[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};

const shift = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---------- De dónde vienen ----------

export function SourcesSection({ m }: { m: AdsMetrics }) {
  const tips = {
    visitas: 'Visitas a la landing de esta fuente.',
    optins: 'Registros de esta fuente.',
    conv: 'Opt-ins sobre visitas de esta fuente.',
    cal: 'Registros de esta fuente que invierten 100 dólares por día o más.',
    grupo: 'Registros de esta fuente que entraron al grupo de WhatsApp.',
  };
  if (!m.fuentes.length) return <div className="state muted">Sin datos en el rango.</div>;
  return (
    <div className="glass table-wrap">
      <table className="table table--num">
        <thead>
          <tr>
            <th>Fuente</th>
            <th><WithTip tip={tips.visitas}>Visitas</WithTip></th>
            <th><WithTip tip={tips.optins}>Opt-ins</WithTip></th>
            <th><WithTip tip={tips.conv}>Conversión</WithTip></th>
            <th><WithTip tip={tips.cal}>Calificados</WithTip></th>
            <th><WithTip tip={tips.grupo}>Entraron al grupo</WithTip></th>
          </tr>
        </thead>
        <tbody>
          {m.fuentes.map((f) => (
            <tr key={f.fuente}>
              <td>{f.fuente}</td>
              <td>{fmt(f.visitas, 'num')}</td>
              <td>{fmt(f.optins, 'num')}</td>
              <td>{fmt(f.visitas ? (f.optins / f.visitas) * 100 : null, 'pct')}</td>
              <td>{fmt(f.calificados, 'num')}</td>
              <td>{fmt(f.grupo, 'num')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Qué respondieron ----------

export function AnswersSection({ m }: { m: AdsMetrics }) {
  const inv = [...m.respuestas_pauta.inversion].sort((a, b) => rank(a.opcion) - rank(b.opcion));
  const sub = (c: number) => <span className="muted"> · {c} califican</span>;
  return (
    <div className="two-col two-col--top">
      <section className="glass panel">
        <h3 className="panel__title"><WithTip tip="Lo que respondieron los registros de pauta sobre su inversión diaria en Meta. Califican: 100 dólares por día o más.">Inversión diaria en Meta</WithTip></h3>
        <BarList rows={inv.map((r) => ({ label: r.opcion, value: r.leads, sub: sub(r.califican) }))} />
      </section>
      <section className="glass panel">
        <h3 className="panel__title"><WithTip tip="País según el prefijo del teléfono de los registros de pauta.">País</WithTip></h3>
        <BarList rows={m.respuestas_pauta.paises.map((r) => ({ label: r.pais, value: r.leads, sub: sub(r.califican) }))} />
      </section>
    </div>
  );
}
const rank = (o: string) => {
  const i = INVESTMENT_LEVELS.indexOf(o);
  return i === -1 ? 99 : i;
};

// ---------- Después del registro ----------

export function AfterSection({ m, team }: { m: AdsMetrics; team: ReactNode }) {
  const e = m.embudo;
  return (
    <>
      <div className="glass panel">
        <h3 className="panel__title"><WithTip tip="De los registros del período, cuántos avanzaron en cada paso del equipo de ventas.">Embudo del equipo</WithTip></h3>
        <Funnel steps={FUNNEL_STEPS.map((d) => ({ key: d.key, value: e.pasos?.[d.key as keyof typeof e.pasos] ?? 0, label: <WithTip tip={d.tip}>{d.label}</WithTip> }))} />
      </div>
      <div className="two-col two-col--top">
        <section className="glass panel">
          <h3 className="panel__title"><WithTip tip="Dónde está cada lead según el tracker de la SDR (incluye los «No cuentan»).">Estado en el tracker</WithTip></h3>
          <BarList rows={e.estados.map((r) => ({ label: r.estado, value: r.leads }))} />
          <p className="muted mx__note">
            <WithTip tip="Etapa del lead en la base (Nuevo o Próximo ciclo si la aplicación no pasó el filtro).">Stage</WithTip>:{' '}
            {e.stages.map((s) => `${s.stage} ${s.leads}`).join(' · ') || '—'}
          </p>
        </section>
        <section className="glass panel">
          <h3 className="panel__title"><WithTip tip="Cuántos intentos de contacto (dials) tiene cada lead.">Intentos de contacto</WithTip></h3>
          <BarList rows={['0', '1', '2', '3', '4+'].map((k) => ({ label: k === '4+' ? '4 o más' : k, value: e.intentos.find((x) => x.intentos === k)?.leads ?? 0 }))} />
        </section>
      </div>
      <h3 className="section-title section-title--sm"><WithTip tip="Métricas de cada SDR y closer (mismo tablero que ven ellos).">Equipo de ventas</WithTip></h3>
      {team}
    </>
  );
}

// ---------- Ventas ----------

export function SalesSection({ m }: { m: AdsMetrics }) {
  const v = m.ventas;
  return (
    <>
      <div className="glass table-wrap">
        <table className="table table--num">
          <thead>
            <tr>
              <th><WithTip tip="Programa u oferta que se vendió en la call.">Programa</WithTip></th>
              <th><WithTip tip="Ventas cerradas en el período.">Ventas</WithTip></th>
              <th><WithTip tip="Monto total vendido (aunque se pague en cuotas).">Vendido</WithTip></th>
              <th><WithTip tip="Lo que ya se cobró de esas ventas.">Cobrado</WithTip></th>
            </tr>
          </thead>
          <tbody>
            {v.por_programa.length === 0 && <tr><td colSpan={4} className="muted">Sin ventas en el período.</td></tr>}
            {v.por_programa.map((p) => (
              <tr key={p.programa}><td>{p.programa}</td><td>{fmt(p.ventas, 'num')}</td><td>{fmt(p.vendido, 'usd')}</td><td>{fmt(p.cobrado, 'usd')}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="two-col two-col--top">
        <Quotas title="Cuotas vencidas" tip="Cuotas de ventas del lanzamiento que ya vencieron y no se cobraron (a hoy, sin importar el rango)." q={v.vencidas} warn />
        <Quotas title="Vencen en los próximos 7 días" tip="Cuotas sin cobrar que vencen desde hoy hasta dentro de 7 días." q={v.proximas_7_dias} />
      </div>
    </>
  );
}

function Quotas({ title, tip, q, warn }: { title: string; tip: string; q: AdsMetrics['ventas']['vencidas']; warn?: boolean }) {
  return (
    <section className="glass panel">
      <div className="panel__head">
        <h3 className="panel__title"><WithTip tip={tip}>{title}</WithTip></h3>
        <span className={warn && q.cuotas ? 'text-warn' : 'muted'}>{q.cuotas} · {fmt(q.monto, 'usd')}</span>
      </div>
      {q.detalle.length > 0 && (
        <ul className="mini-list">
          {q.detalle.map((d, i) => (
            <li key={i}><div className="mini-list__item"><span>{d.nombre || '—'} <span className="muted">· {d.programa ?? '—'}</span></span><span>{fmt(d.monto, 'usd')} · {fmtDate(d.vence)}</span></div></li>
          ))}
        </ul>
      )}
    </section>
  );
}

export type { Summary };
