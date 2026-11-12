import { useMemo, useState, type ReactNode } from 'react';
import { useAsync } from '../../lib/useAsync';
import { useLiveReload } from '../../lib/realtime';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { Pill, State } from '../ui';
import { WithTip } from '../../components/InfoTip';
import { LineChart, SERIES_COLORS } from './charts';
import { fmt } from './defs';
import type { MetaState } from './meta';
import {
  activeVersions, confidence, costByVersion, fetchLandingTests, groupBy, hourLabel, lowData, MIN_REGISTROS, MIN_VISITAS, rates, retiredVersions, sideOf, totalsOf, winnerOf,
  type LandingTest, type LandingTestsData, type TestFilters, type TestVersion, type Totals, type WinBy,
} from './landingTests';

type Tab = 'actual' | 'historial' | 'comparar' | 'otras';

const TIPS = {
  visitas: 'Visitas a la landing en esta versión. «≈» = incluye visitas de días con corte repartidas por hora (estimado).',
  registros: 'Personas que se registraron en esta versión.',
  conversion: 'Registros sobre visitas.',
  calificados: 'Registros que invierten 100 dólares por día o más en Meta.',
  pct_calificados: 'Calificados sobre registros.',
  pct_grupo: 'Registros que entraron al grupo de WhatsApp.',
  cpl: 'Gasto de pauta estimado sobre registros de pauta. El gasto de cada día se reparte según las visitas de pauta de cada versión.',
  cp_calificado: 'Gasto de pauta estimado sobre calificados de pauta.',
};

export default function LandingTestsSection({ from, to, meta }: { from: string | null; to: string | null; meta: MetaState | null }) {
  const [fuente, setFuente] = useState<TestFilters['fuente']>('todas');
  const [campana, setCampana] = useState('');
  const [contenido, setContenido] = useState('');
  const [anuncio, setAnuncio] = useState('');
  const [estable, setEstable] = useState(true);
  const [tab, setTab] = useState<Tab>('actual');
  const filters: TestFilters = { from, to, fuente, campana, contenido, anuncio, estable };
  const q = useAsync(() => fetchLandingTests(filters), [from, to, fuente, campana, contenido, anuncio, estable]);
  useLiveReload(['lead_launches'], q.reload, { delayMs: 5000 });
  const d = q.data;
  const adName = (id: string) => (meta?.kind === 'ok' ? meta.data.anuncios.find((a) => a.id === id)?.nombre : null) ?? id;
  const current = d?.tests.find((t) => t.tipo === 'test' && !t.fin) ?? null;

  return (
    <>
      <div className="lt__filters">
        <div className="seg">
          {([['todas', 'Todas las fuentes'], ['pauta', 'Pauta'], ['organico', 'Orgánico']] as const).map(([k, l]) => (
            <button key={k} type="button" className={`seg__opt${fuente === k ? ' is-on' : ''}`} onClick={() => setFuente(k)}>{l}</button>
          ))}
        </div>
        <select className="field field--select lt__select" value={campana} onChange={(e) => setCampana(e.target.value)} aria-label="Campaña (utm_campaign)">
          <option value="">Todas las campañas</option>
          {d?.opciones.campanas.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="field field--select lt__select" value={contenido} onChange={(e) => setContenido(e.target.value)} aria-label="Contenido (utm_content)">
          <option value="">Todos los utm_content</option>
          {d?.opciones.contenidos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="field field--select lt__select" value={anuncio} onChange={(e) => setAnuncio(e.target.value)} aria-label="Anuncio">
          <option value="">Todos los anuncios</option>
          {d?.opciones.anuncios.map((c) => <option key={c} value={c}>{adName(c)}</option>)}
        </select>
        <label className="check lt__check">
          <input type="checkbox" checked={estable} onChange={(e) => setEstable(e.target.checked)} />
          <WithTip tip="Toma los datos desde que la página quedó estable (por ejemplo, el 12/11 desde las 04:01). Destildalo para ver desde el inicio del test.">Desde que la página quedó estable</WithTip>
        </label>
      </div>
      {d?.solo_visitas_con_hora && (
        <p className="muted lt__note">Con filtro de campaña, contenido o anuncio, las visitas solo cuentan desde el {fmtDateTime(d.log_desde)} (antes no se guardaban las UTM de cada visita). Los registros sí se filtran en todo el período.</p>
      )}

      <nav className="tabs lt__tabs">
        {([['actual', 'Test actual'], ['historial', 'Historial'], ['comparar', 'Comparar'], ['otras', 'Otras landings y sin test']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" className={`tabs__link tabs__btn${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      <State loading={q.loading} error={q.error}>
        {d && tab === 'actual' && (current ? <CurrentTest test={current} data={d} meta={meta} estable={estable} /> : <div className="state muted">No hay ningún test abierto.</div>)}
        {d && tab === 'historial' && <History data={d} />}
        {d && tab === 'comparar' && <Compare data={d} />}
        {d && tab === 'otras' && <Others data={d} />}
      </State>
    </>
  );
}

// ---------- Test actual ----------

function CurrentTest({ test, data, meta, estable }: { test: LandingTest; data: LandingTestsData; meta: MetaState | null; estable: boolean }) {
  const [by, setBy] = useState<WinBy>('conversion');
  const cost = meta ? costByVersion(test, data, meta) : null;
  const costo = cost?.costo ?? null;
  const vs = activeVersions(test);
  const retired = retiredVersions(test);
  const best = winnerOf(vs.map((v) => ({ key: v.code, t: totalsOf([v], costo) })), by);
  const titulares = groupBy(vs, 'titular_key');
  const ordenes = groupBy(vs, 'orden_key');
  const bestTit = winnerOf(titulares.map((g) => ({ key: g.key, t: totalsOf(g.versiones, costo) })), by);
  const bestOrd = winnerOf(ordenes.map((g) => ({ key: g.key, t: totalsOf(g.versiones, costo) })), by);
  const isMatrix = titulares.length > 1 && ordenes.length > 1;
  const byLabel = by === 'conversion' ? 'conversión (registros / visitas)' : 'calificados por visita';

  return (
    <div className="lt">
      <div className="glass panel">
        <div className="panel__head">
          <h3 className="panel__title">{test.nombre}</h3>
          <Pill tone="accent">Abierto</Pill>
        </div>
        <p className="muted lt__desc">
          Desde el {fmtDateTime(test.inicio)}{test.estable_desde && estable ? ` · datos desde que la página quedó estable (${fmtDateTime(test.estable_desde)})` : ''}. {test.descripcion}
        </p>
        <div className="lt__winby">
          <span className="muted">Ganador por</span>
          <div className="seg">
            <button type="button" className={`seg__opt${by === 'conversion' ? ' is-on' : ''}`} onClick={() => setBy('conversion')}>Conversión</button>
            <button type="button" className={`seg__opt${by === 'calificados_por_visita' ? ' is-on' : ''}`} onClick={() => setBy('calificados_por_visita')}>Calificados por visita</button>
          </div>
        </div>
        <div className="lt__winners">
          <WinnerLine label="Mejor versión" w={best} name={(k) => vs.find((v) => v.code === k)?.nombre ?? k} byLabel={byLabel} />
          {retired.length > 0 && <p className="muted lt__note">Siguen en el test: {vs.map((v) => v.code).join(', ')}. {retired.length} versiones salieron el {fmtDateTime(retired[0].retirada)}.</p>}
          {isMatrix && <WinnerLine label="Mejor titular" w={bestTit} name={(k) => `Titular ${k.toUpperCase()}`} byLabel={byLabel} />}
          {isMatrix && <WinnerLine label="Mejor orden" w={bestOrd} name={(k) => `Orden ${k} · ${vs.find((v) => v.orden_key === k)?.orden ?? ''}`} byLabel={byLabel} />}
        </div>
        <p className="muted lt__note">
          Hacen falta al menos {MIN_VISITAS} visitas y {MIN_REGISTROS} registros por versión, y 95% de confianza, para que la diferencia sea confiable.
          {costo ? ' Los costos son estimados: el link /clase reparte al azar, así que el gasto de cada día se reparte según las visitas de pauta de cada versión.' : ''}
          {cost && Object.keys(cost.fijos).length > 0 ? ` Anuncios con link fijo: ${Object.entries(cost.fijos).map(([a, c]) => `${a} → ${c}`).join(', ')}.` : ''}
        </p>
      </div>

      {isMatrix && (
        <>
          <h3 className="section-title section-title--sm">Matriz titular × orden</h3>
          <div className="lt__matrix">
            <div className="lt__corner" />
            {ordenes.map((o) => (
              <div key={o.key} className="lt__colhead"><strong>Orden {o.key}</strong><span className="muted">{o.versiones[0]?.orden}</span></div>
            ))}
            {titulares.map((t) => (
              <MatrixRow key={t.key} tkey={t.key} titular={t.versiones[0]?.titular ?? ''} cells={ordenes.map((o) => vs.find((v) => v.titular_key === t.key && v.orden_key === o.key) ?? null)} costo={costo} best={best?.key ?? null} />
            ))}
          </div>
        </>
      )}

      {vs.length === 2 && <HeadToHead a={vs[0]} b={vs[1]} costo={costo} />}

      <h3 className="section-title section-title--sm">{isMatrix ? 'Por versión' : 'Versiones'}</h3>
      <TotalsTable rows={vs.map((v) => ({ key: v.code, label: v.nombre, sub: v.titular, t: totalsOf([v], costo), rez: v.rezagados_visitas + v.rezagados_registros }))} best={best?.key ?? null} showCost={Boolean(costo)} />

      {isMatrix && (
        <div className="two-col two-col--top lt__groups">
          <section>
            <h3 className="section-title section-title--sm"><WithTip tip="Cada titular, sumando sus 3 órdenes. Sirve para elegir el mejor titular.">Por titular</WithTip></h3>
            <TotalsTable rows={titulares.map((g) => ({ key: g.key, label: `Titular ${g.key.toUpperCase()}`, sub: g.versiones[0]?.titular, t: totalsOf(g.versiones, costo) }))} best={bestTit?.key ?? null} showCost={Boolean(costo)} compact />
          </section>
          <section>
            <h3 className="section-title section-title--sm"><WithTip tip="Cada orden, sumando los 3 titulares. Sirve para elegir el mejor orden.">Por orden</WithTip></h3>
            <TotalsTable rows={ordenes.map((g) => ({ key: g.key, label: `Orden ${g.key}`, sub: g.versiones[0]?.orden, t: totalsOf(g.versiones, costo) }))} best={bestOrd?.key ?? null} showCost={Boolean(costo)} compact />
          </section>
        </div>
      )}

      {retired.length > 0 && <Retired versiones={retired} costo={costo} />}

      <Evolution test={test} active={vs.map((v) => v.code)} />
      {test.eventos.length > 0 && (
        <div className="glass panel">
          <h3 className="panel__title"><WithTip tip="Cambios hechos en la página durante el test. Están marcados con ◆ en el gráfico.">Cambios durante el test</WithTip></h3>
          <ul className="mini-list">
            {test.eventos.map((e, i) => (
              <li key={i}><div className="mini-list__item"><span>{e.descripcion}{e.variants ? <span className="muted"> · {e.variants.join(', ')}</span> : <span className="muted"> · todas</span>}</span><span className="muted">{fmtDateTime(e.at)}{e.until ? ` – ${fmtDateTime(e.until)}` : ''}</span></div></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Dos versiones cara a cara: cada métrica, la diferencia y si ya es confiable. */
function HeadToHead({ a, b, costo }: { a: TestVersion; b: TestVersion; costo: Record<string, number> | null }) {
  const ta = totalsOf([a], costo);
  const tb = totalsOf([b], costo);
  const ra = rates(ta);
  const rb = rates(tb);
  const confConv = confidence(ta.registros, ta.visitas, tb.registros, tb.visitas);
  const confCal = confidence(ta.calificados, ta.visitas, tb.calificados, tb.visitas);
  const pocos = lowData(ta) || lowData(tb);
  const rows: [string, string, number | null, number | null, 'pct' | 'num' | 'usd2', boolean][] = [
    ['Visitas', TIPS.visitas, ta.visitas, tb.visitas, 'num', true],
    ['Registros', TIPS.registros, ta.registros, tb.registros, 'num', true],
    ['Conversión', TIPS.conversion, ra.conversion, rb.conversion, 'pct', true],
    ['Calificados', TIPS.calificados, ta.calificados, tb.calificados, 'num', true],
    ['% calificados', TIPS.pct_calificados, ra.pct_calificados, rb.pct_calificados, 'pct', true],
    ['Calificados por visita', 'Calificados sobre visitas.', ra.calificados_por_visita, rb.calificados_por_visita, 'pct', true],
    ['% grupo', TIPS.pct_grupo, ra.pct_grupo, rb.pct_grupo, 'pct', true],
    ...(costo ? [['CPL', TIPS.cpl, ra.cpl, rb.cpl, 'usd2', false], ['CP calificado', TIPS.cp_calificado, ra.cp_calificado, rb.cp_calificado, 'usd2', false]] as [string, string, number | null, number | null, 'usd2', boolean][] : []),
  ];
  const lead = (ra.conversion ?? 0) === (rb.conversion ?? 0) ? null : (ra.conversion ?? 0) > (rb.conversion ?? 0) ? a : b;
  return (
    <div className="glass panel lt__h2h">
      <h3 className="panel__title"><WithTip tip="Las dos versiones que siguen en el test, con todos sus datos desde que arrancó (las dos corrieron todo el período).">Mano a mano: {a.code} contra {b.code}</WithTip></h3>
      <div className="table-wrap">
        <table className="table table--num">
          <thead>
            <tr>
              <th></th>
              <th>{a.code}<div className="cell-sub lt__sub">{a.orden}</div></th>
              <th>{b.code}<div className="cell-sub lt__sub">{b.orden}</div></th>
              <th>Mejor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, tip, va, vb, f, higher]) => {
              const volumen = label === 'Visitas' || label === 'Registros' || label === 'Calificados';
              const win = volumen || va === null || vb === null || va === vb ? null : (va > vb) === higher ? a.code : b.code;
              return (
                <tr key={label}>
                  <td><WithTip tip={tip}>{label}</WithTip></td>
                  <td className={win === a.code ? 'lt__win' : undefined}>{label === 'Visitas' && ta.estimado ? '≈' : ''}{fmt(va, f)}</td>
                  <td className={win === b.code ? 'lt__win' : undefined}>{label === 'Visitas' && tb.estimado ? '≈' : ''}{fmt(vb, f)}</td>
                  <td>{volumen ? '' : win ?? '='}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="lt__winner">
        {lead ? <>Va adelante <strong>{lead.code}</strong> en conversión</> : 'Están empatadas en conversión'}
        {' '}· confianza {fmt(confConv, 'pct')} en conversión y {fmt(confCal, 'pct')} en calificados por visita{' '}
        {!pocos && confConv !== null && confConv >= 95 ? <Pill tone="ok">Confiable</Pill> : <Pill tone="warn">{pocos ? 'Pocos datos' : 'Todavía no es confiable'}</Pill>}
      </p>
      {pocos && <p className="muted lt__note">Para decidir hacen falta al menos {MIN_VISITAS} visitas y {MIN_REGISTROS} registros en cada una, y 95% de confianza.</p>}
    </div>
  );
}

/** Versiones que salieron del test antes de que termine: quedan sus números, aparte. */
function Retired({ versiones, costo }: { versiones: TestVersion[]; costo: Record<string, number> | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass panel">
      <button type="button" className="panel__head link--btn lt__histhead" onClick={() => setOpen((o) => !o)}>
        <span><strong>Salieron del test</strong> <span className="muted">· {versiones.map((v) => v.code).join(', ')} · el {fmtDateTime(versiones[0].retirada)}</span></span>
        <span className="muted">{open ? '▾' : '▸'}</span>
      </button>
      {open && <TotalsTable rows={versiones.map((v) => ({ key: v.code, label: v.nombre, sub: v.titular, t: totalsOf([v], costo) }))} best={null} showCost={Boolean(costo)} />}
    </div>
  );
}

function WinnerLine({ label, w, name, byLabel }: { label: string; w: ReturnType<typeof winnerOf<string>>; name: (k: string) => string; byLabel: string }) {
  if (!w) return <p className="muted">{label}: sin datos todavía.</p>;
  return (
    <p className="lt__winner">
      <span className="muted">{label}:</span> <strong>{name(w.key)}</strong>
      {w.contra !== null && <span className="muted"> · por {byLabel}, contra {name(w.contra)} con {fmt(w.confianza, 'pct')} de confianza</span>}
      {' '}{w.confiable ? <Pill tone="ok">Confiable</Pill> : <Pill tone="warn">{w.pocosDatos ? 'Pocos datos' : 'Todavía no es confiable'}</Pill>}
    </p>
  );
}

function MatrixRow({ tkey, titular, cells, costo, best }: { tkey: string; titular: string; cells: (TestVersion | null)[]; costo: Record<string, number> | null; best: string | null }) {
  return (
    <>
      <div className="lt__rowhead"><strong>Titular {tkey.toUpperCase()}</strong><span className="muted">{titular}</span></div>
      {cells.map((v, i) => {
        if (!v) return <div key={i} className="lt__cell muted">—</div>;
        const t = totalsOf([v], costo);
        const r = rates(t);
        return (
          <div key={v.code} className={`lt__cell glass${best === v.code ? ' is-best' : ''}${lowData(t) ? ' is-low' : ''}`}>
            <div className="lt__cellhead"><strong>{v.code}</strong>{best === v.code && <Pill tone="ok">Mejor</Pill>}</div>
            <div className="lt__big">{fmt(r.conversion, 'pct')}<span className="muted"> conv.</span></div>
            <dl className="lt__kv">
              <dt>Visitas</dt><dd>{t.estimado ? '≈' : ''}{fmt(t.visitas, 'num')}</dd>
              <dt>Registros</dt><dd>{fmt(t.registros, 'num')}</dd>
              <dt>Calificados</dt><dd>{fmt(t.calificados, 'num')} <span className="muted">({fmt(r.pct_calificados, 'pct')})</span></dd>
              <dt>Grupo</dt><dd>{fmt(r.pct_grupo, 'pct')}</dd>
              {costo && <><dt>CPL</dt><dd>{fmt(r.cpl, 'usd2')}</dd><dt>CP calif.</dt><dd>{fmt(r.cp_calificado, 'usd2')}</dd></>}
            </dl>
            {lowData(t) && <span className="lt__low">Pocos datos</span>}
          </div>
        );
      })}
    </>
  );
}

function TotalsTable({ rows, best, showCost, compact }: { rows: { key: string; label: string; sub?: string; t: Totals; rez?: number }[]; best: string | null; showCost: boolean; compact?: boolean }) {
  return (
    <div className="glass table-wrap">
      <table className="table table--num lt__table">
        <thead>
          <tr>
            <th>Versión</th>
            <th><WithTip tip={TIPS.visitas}>Visitas</WithTip></th>
            <th><WithTip tip={TIPS.registros}>Registros</WithTip></th>
            <th><WithTip tip={TIPS.conversion}>Conversión</WithTip></th>
            <th><WithTip tip={TIPS.calificados}>Calificados</WithTip></th>
            <th><WithTip tip={TIPS.pct_calificados}>% calif.</WithTip></th>
            <th><WithTip tip={TIPS.pct_grupo}>% grupo</WithTip></th>
            {showCost && <th><WithTip tip={TIPS.cpl}>CPL</WithTip></th>}
            {showCost && <th><WithTip tip={TIPS.cp_calificado}>CP calif.</WithTip></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const r = rates(row.t);
            return (
              <tr key={row.key} className={best === row.key ? 'lt__best' : undefined}>
                <td>
                  <div className="cell-main">{row.label} {best === row.key && <Pill tone="ok">Mejor</Pill>} {lowData(row.t) && <Pill tone="warn">Pocos datos</Pill>}</div>
                  {!compact && row.sub && <div className="cell-sub lt__sub">{row.sub}</div>}
                  {compact && row.sub && <div className="cell-sub lt__sub">{row.sub}</div>}
                  {row.rez ? <div className="cell-sub"><WithTip tip="Visitas o registros que llegaron después de que terminó el test (página en caché).">{fmt(row.rez, 'num')} rezagados</WithTip></div> : null}
                </td>
                <td>{row.t.estimado ? '≈' : ''}{fmt(row.t.visitas, 'num')}</td>
                <td>{fmt(row.t.registros, 'num')}</td>
                <td><strong>{fmt(r.conversion, 'pct')}</strong></td>
                <td>{fmt(row.t.calificados, 'num')}</td>
                <td>{fmt(r.pct_calificados, 'pct')}</td>
                <td>{fmt(r.pct_grupo, 'pct')}</td>
                {showCost && <td>{fmt(r.cpl, 'usd2')}</td>}
                {showCost && <td>{fmt(r.cp_calificado, 'usd2')}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Evolución ----------

type Metric = 'conversion' | 'visitas' | 'registros' | 'calificados_por_visita';

function Evolution({ test, active }: { test: LandingTest; active: string[] }) {
  const vs = test.versiones;
  const act = vs.filter((v) => active.includes(v.code));
  const hasMatrix = new Set(act.map((v) => v.titular_key)).size > 1 && new Set(act.map((v) => v.orden_key)).size > 1;
  const [mode, setMode] = useState<'titular' | 'orden' | 'versiones'>(hasMatrix ? 'titular' : 'versiones');
  const [picked, setPicked] = useState<string[]>(act.slice(0, 3).map((v) => v.code));
  const [metric, setMetric] = useState<Metric>('conversion');
  const [gran, setGran] = useState<'dia' | 'hora'>('dia');
  const hasHours = vs.some((v) => v.horas.length > 0);

  const groups: { name: string; versiones: TestVersion[] }[] =
    mode === 'versiones'
      ? picked.map((c) => ({ name: c, versiones: vs.filter((v) => v.code === c) }))
      : groupBy(act, mode === 'titular' ? 'titular_key' : 'orden_key').map((g) => ({ name: `${mode === 'titular' ? 'Titular' : 'Orden'} ${g.key.toUpperCase()}`, versiones: g.versiones }));

  const xs = useMemo(() => {
    const set = new Set<string>();
    vs.forEach((v) => (gran === 'dia' ? v.serie.forEach((p) => set.add(p.dia)) : v.horas.forEach((p) => set.add(p.hora))));
    return [...set].sort();
  }, [vs, gran]);

  const value = (vis: number, reg: number, cal: number) =>
    metric === 'visitas' ? vis : metric === 'registros' ? reg : vis > 0 ? ((metric === 'conversion' ? reg : cal) / vis) * 100 : null;
  const series = groups.map((g, i) => ({
    name: g.name,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    values: xs.map((x) => {
      let vis = 0, reg = 0, cal = 0;
      for (const v of g.versiones) {
        if (gran === 'dia') {
          const p = v.serie.find((s) => s.dia === x);
          if (p) { vis += Number(p.visitas); reg += Number(p.registros); cal += Number(p.calificados); }
        } else {
          const p = v.horas.find((s) => s.hora === x);
          if (p) { vis += Number(p.visitas); reg += Number(p.registros); }
        }
      }
      return value(vis, reg, cal);
    }),
  }));

  const markers = test.eventos.flatMap((e) => {
    const key = gran === 'dia' ? localDay(e.at) : hourKey(e.at);
    const i = xs.indexOf(key);
    return i === -1 ? [] : [{ i, label: `${fmtDateTime(e.at)} · ${e.descripcion}` }];
  });
  // Varios cambios el mismo día: una sola marca con todos.
  const merged = Object.values(markers.reduce<Record<number, { i: number; label: string }>>((acc, m) => {
    acc[m.i] = acc[m.i] ? { i: m.i, label: `${acc[m.i].label}\n${m.label}` } : m;
    return acc;
  }, {}));
  const isPct = metric === 'conversion' || metric === 'calificados_por_visita';

  return (
    <div className="glass panel">
      <div className="panel__head lt__evohead">
        <h3 className="panel__title"><WithTip tip="Cómo evoluciona cada grupo de versiones. ◆ = cambios en la página (pasá el cursor para ver cuáles).">Evolución</WithTip></h3>
        <div className="lt__evoctl">
          <select className="field field--select mx__select" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="Agrupar">
            {hasMatrix && <option value="titular">Por titular</option>}
            {hasMatrix && <option value="orden">Por orden</option>}
            <option value="versiones">Versiones elegidas (hasta 3)</option>
          </select>
          <select className="field field--select mx__select" value={metric} onChange={(e) => setMetric(e.target.value as Metric)} aria-label="Métrica">
            <option value="conversion">Conversión</option>
            <option value="calificados_por_visita" disabled={gran === 'hora'}>Calificados por visita</option>
            <option value="visitas">Visitas</option>
            <option value="registros">Registros</option>
          </select>
          <div className="seg">
            <button type="button" className={`seg__opt${gran === 'dia' ? ' is-on' : ''}`} onClick={() => setGran('dia')}>Por día</button>
            <button type="button" className={`seg__opt${gran === 'hora' ? ' is-on' : ''}`} disabled={!hasHours} title={hasHours ? undefined : 'Todavía no hay visitas con hora'} onClick={() => { setGran('hora'); if (metric === 'calificados_por_visita') setMetric('conversion'); }}>Por hora</button>
          </div>
        </div>
      </div>
      {mode === 'versiones' && (
        <div className="filters lt__chips">
          {vs.map((v) => (
            <button key={v.code} type="button" className={`chip chip--sm${picked.includes(v.code) ? ' is-active' : ''}`}
              onClick={() => setPicked((p) => (p.includes(v.code) ? p.filter((c) => c !== v.code) : p.length >= 3 ? p : [...p, v.code]))}>{v.code}</button>
          ))}
        </div>
      )}
      <LineChart days={xs} series={series} label="Evolución del test" format={(v) => fmt(v, isPct ? 'pct' : 'num')} markers={merged}
        xLabel={gran === 'dia' ? undefined : hourLabel} />
    </div>
  );
}

const localDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(iso));
const hourKey = (iso: string) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:00:00`;
};

// ---------- Historial ----------

function History({ data }: { data: LandingTestsData }) {
  const ended = data.tests.filter((t) => t.tipo === 'test' && t.fin);
  const [open, setOpen] = useState<string | null>(ended[0]?.id ?? null);
  if (!ended.length) return <div className="state muted">Todavía no hay tests terminados.</div>;
  return (
    <div className="stack">
      {ended.map((t) => {
        const w = winnerOf(t.versiones.map((v) => ({ key: v.code, t: totalsOf([v]) })), 'conversion');
        const tot = totalsOf(t.versiones);
        const hasData = tot.visitas > 0 || tot.registros > 0;
        return (
          <article key={t.id} className="glass panel">
            <button type="button" className="panel__head link--btn lt__histhead" onClick={() => setOpen(open === t.id ? null : t.id)}>
              <span>
                <strong>{t.nombre}</strong>
                <span className="muted"> · {fmtDateTime(t.inicio)} → {fmtDateTime(t.fin)}</span>
              </span>
              <span className="lt__histwin">
                {hasData && w ? <>Ganó <strong>{t.versiones.find((v) => v.code === w.key)?.nombre}</strong> {w.confiable ? <Pill tone="ok">{fmt(w.confianza, 'pct')}</Pill> : <Pill tone="warn">{fmt(w.confianza, 'pct')} · no concluyente</Pill>}</> : <Pill tone="muted">Sin datos en el campus</Pill>}
                <span className="muted">{open === t.id ? '▾' : '▸'}</span>
              </span>
            </button>
            {open === t.id && (
              <>
                <p className="muted lt__desc">{t.descripcion}{t.datos_desde ? ` Datos desde el ${fmtDate(t.datos_desde)}.` : ''}</p>
                {hasData && (
                  <TotalsTable rows={t.versiones.map((v) => ({ key: v.code, label: `${v.code} · ${v.nombre}`, sub: v.titular, t: totalsOf([v]), rez: v.rezagados_visitas + v.rezagados_registros }))} best={w?.key ?? null} showCost={false} />
                )}
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

// ---------- Comparar ----------

function Compare({ data }: { data: LandingTestsData }) {
  const options = data.tests.filter((t) => t.tipo === 'test').flatMap((t) => t.versiones.map((v) => ({ id: `${t.id}|${v.code}`, label: `${t.nombre} · ${v.nombre}`, test: t, v })));
  const current = data.tests.find((t) => t.tipo === 'test' && !t.fin);
  const bestCur = current ? winnerOf(activeVersions(current).map((v) => ({ key: v.code, t: totalsOf([v]) })), 'conversion') : null;
  const t16 = data.tests.find((t) => t.id === 'orden-16-10');
  const best16 = t16 ? winnerOf(t16.versiones.map((v) => ({ key: v.code, t: totalsOf([v]) })), 'conversion') : null;
  const [a, setA] = useState(current && bestCur ? `${current.id}|${bestCur.key}` : options[0]?.id ?? '');
  const [b, setB] = useState(t16 && best16 ? `${t16.id}|${best16.key}` : options[1]?.id ?? '');
  const [mode, setMode] = useState<'dia' | 'n'>('dia');
  const A = options.find((o) => o.id === a);
  const B = options.find((o) => o.id === b);
  const maxDays = Math.max(1, Math.min(A?.v.serie.length ?? 1, B?.v.serie.length ?? 1));
  const [n, setN] = useState(maxDays);
  const nn = Math.min(Math.max(1, n), maxDays);
  const sa = A ? sideOf(A.v, mode === 'n' ? nn : null) : null;
  const sb = B ? sideOf(B.v, mode === 'n' ? nn : null) : null;
  const conf = sa && sb ? confidence(sa.registros, sa.visitas, sb.registros, sb.visitas) : null;

  const rows: [string, string, (s: NonNullable<typeof sa>) => number | null, 'num' | 'pct'][] = mode === 'dia'
    ? [
        ['Días con datos', 'Días en los que la versión tuvo visitas o registros.', (s) => s.dias, 'num'],
        ['Visitas por día', 'Promedio de visitas por día con datos.', (s) => (s.dias ? s.visitas / s.dias : null), 'num'],
        ['Registros por día', 'Promedio de registros por día con datos.', (s) => (s.dias ? s.registros / s.dias : null), 'num'],
        ['Conversión', 'Registros sobre visitas en todo el período.', (s) => (s.visitas ? (s.registros / s.visitas) * 100 : null), 'pct'],
        ['% calificados', 'Calificados sobre registros.', (s) => (s.registros ? (s.calificados / s.registros) * 100 : null), 'pct'],
        ['Calificados por visita', 'Calificados sobre visitas.', (s) => (s.visitas ? (s.calificados / s.visitas) * 100 : null), 'pct'],
        ['% grupo', 'Registros que entraron al grupo de WhatsApp.', (s) => (s.registros ? (s.grupo / s.registros) * 100 : null), 'pct'],
      ]
    : [
        ['Visitas', `Visitas en los primeros ${nn} días con datos de cada versión.`, (s) => s.visitas, 'num'],
        ['Registros', `Registros en los primeros ${nn} días con datos.`, (s) => s.registros, 'num'],
        ['Conversión', 'Registros sobre visitas en esos días.', (s) => (s.visitas ? (s.registros / s.visitas) * 100 : null), 'pct'],
        ['% calificados', 'Calificados sobre registros.', (s) => (s.registros ? (s.calificados / s.registros) * 100 : null), 'pct'],
        ['Calificados por visita', 'Calificados sobre visitas.', (s) => (s.visitas ? (s.calificados / s.visitas) * 100 : null), 'pct'],
        ['% grupo', 'Registros que entraron al grupo de WhatsApp.', (s) => (s.registros ? (s.grupo / s.registros) * 100 : null), 'pct'],
      ];

  return (
    <div className="glass panel">
      <div className="lt__cmpctl">
        <label className="afield"><span className="afield__label">Versión A</span>
          <select className="field field--select" value={a} onChange={(e) => setA(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        </label>
        <label className="afield"><span className="afield__label">Versión B</span>
          <select className="field field--select" value={b} onChange={(e) => setB(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        </label>
        <div className="afield">
          <span className="afield__label"><WithTip tip="Por día: promedios por día y tasas de todo el período. Primeros N días: lo que pasó en los primeros N días con datos de cada versión, para comparar períodos de igual duración.">Cómo comparar</WithTip></span>
          <div className="filters" style={{ marginBottom: 0 }}>
            <div className="seg">
              <button type="button" className={`seg__opt${mode === 'dia' ? ' is-on' : ''}`} onClick={() => setMode('dia')}>Normalizado por día</button>
              <button type="button" className={`seg__opt${mode === 'n' ? ' is-on' : ''}`} onClick={() => setMode('n')}>Primeros N días</button>
            </div>
            {mode === 'n' && <input className="field field--num" type="number" min={1} max={maxDays} value={nn} onChange={(e) => setN(Number(e.target.value))} aria-label="Cantidad de días" />}
          </div>
        </div>
      </div>
      {sa && sb && A && B && (
        <div className="table-wrap">
          <table className="table table--num">
            <thead><tr><th></th><th>A · {A.v.code}</th><th>B · {B.v.code}</th><th>Diferencia</th></tr></thead>
            <tbody>
              {rows.map(([label, tip, f, kind]) => {
                const va = f(sa);
                const vb = f(sb);
                const diff = va !== null && vb !== null ? va - vb : null;
                return (
                  <tr key={label}>
                    <td><WithTip tip={tip}>{label}</WithTip></td>
                    <td>{fmt(va, kind)}</td>
                    <td>{fmt(vb, kind)}</td>
                    <td>{diff === null ? '—' : `${diff > 0 ? '+' : ''}${fmt(diff, kind === 'pct' ? 'x' : 'num')}${kind === 'pct' ? ' pts' : ''}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted lt__note">
        {A && <>A: {A.test.nombre}{A.v.titular ? ` · «${A.v.titular}»` : ''}. </>}
        {B && <>B: {B.test.nombre}{B.v.titular ? ` · «${B.v.titular}»` : ''}. </>}
        Confianza de que la conversión es distinta: <strong>{fmt(conf, 'pct')}</strong>{conf !== null && conf < 95 ? ' (todavía no es concluyente)' : ''}.
        Ojo: los tests corrieron en fechas distintas, con otra pauta y otro momento del lanzamiento.
      </p>
    </div>
  );
}

// ---------- Otras landings y sin test ----------

function Others({ data }: { data: LandingTestsData }) {
  const landings = data.tests.filter((t) => t.tipo === 'landing');
  return (
    <div className="stack">
      {landings.map((t) => (
        <section key={t.id}>
          <h3 className="section-title section-title--sm"><WithTip tip={t.descripcion}>{t.nombre}</WithTip></h3>
          <TotalsTable rows={t.versiones.map((v) => ({ key: v.code, label: `${v.code} · ${v.nombre}`, sub: v.titular, t: totalsOf([v]) }))} best={null} showCost={false} />
        </section>
      ))}
      <section>
        <h3 className="section-title section-title--sm"><WithTip tip="Visitas y registros con un código de versión que no pertenece a ningún test cargado (o sin código).">Sin test</WithTip></h3>
        {data.sin_test.length === 0 ? <p className="muted">No hay.</p> : (
          <div className="glass table-wrap">
            <table className="table table--num">
              <thead><tr><th>Código</th><th>Visitas</th><th>Registros</th></tr></thead>
              <tbody>{data.sin_test.map((s) => <tr key={s.code}><td>{s.code ? <code>{s.code}</code> : <span className="muted">(sin código)</span>}</td><td>{fmt(s.visitas, 'num')}</td><td>{fmt(s.registros, 'num')}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export type { ReactNode };
