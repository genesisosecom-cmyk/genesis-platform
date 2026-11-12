import { useEffect, useState } from 'react';
import { useAsync } from '../../lib/useAsync';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { State } from '../ui';
import { useLaunchPicker } from './LeadsPage';
import TeamMetricsPanel from '../../crm/TeamMetricsPanel';
import { useLiveReload } from '../../lib/realtime';
import { rangeDates, todayAR, type RangeKey } from '../../crm/teamMetrics';
import { fetchAdsMetrics } from '../metrics/api';
import { fetchMeta, type MetaState } from '../metrics/meta';
import { AfterSection, AnswersSection, PautaSection, SalesSection, SectionTitle, SourcesSection } from '../metrics/sections';
import LandingTestsSection from '../metrics/LandingTestsSection';
import { AdsSection, MetaNotice, TrafficSection } from '../metrics/AdsSection';

const RANGES: [RangeKey, string][] = [
  ['hoy', 'Hoy'],
  ['7dias', '7 días'],
  ['todo', 'Todo el lanzamiento'],
  ['custom', 'Personalizado'],
];

const SECTIONS: [string, string, string][] = [
  ['pauta', 'Cómo viene la pauta', 'Registros, visitas y conversión del período; con Meta conectado, también inversión y costos.'],
  ['trafico', 'Cómo baja el tráfico', 'De las impresiones a los que entran al grupo, solo pauta: qué % sigue en cada paso.'],
  ['anuncios', 'Anuncios', 'Como el Administrador de anuncios, pero con lo que pasa después del clic.'],
  ['versiones', 'Test de versiones', 'El test de landing que está corriendo (d1 contra d3), versión por versión. Los tests anteriores quedan en Configuración CRM.'],
  ['fuentes', 'De dónde vienen los opt-ins', 'Visitas y registros por fuente de tráfico.'],
  ['respuestas', 'Qué respondieron', 'Inversión diaria y país de los registros de pauta.'],
  ['despues', 'Después del registro', 'Cómo avanzan los registros con el equipo de ventas.'],
  ['ventas', 'Ventas', 'Ventas del lanzamiento por programa y cuotas por cobrar.'],
];

export default function MetricsPage() {
  const { launches, launchId, picker } = useLaunchPicker();
  const [range, setRange] = useState<RangeKey>('todo');
  const [custom, setCustom] = useState({ from: '', to: todayAR() });
  const { from, to } = rangeDates(range, custom);
  return (
    <State loading={launches.loading} error={launches.error} empty={!launchId}>
      {launchId && (
        <>
          <div className="toolbar mx__filters">
            <div className="filters" style={{ marginBottom: 0 }}>
              {picker}
              <div className="seg tm__range">
                {RANGES.map(([k, label]) => (
                  <button key={k} type="button" className={`seg__opt${range === k ? ' is-on' : ''}`} onClick={() => setRange(k)}>{label}</button>
                ))}
              </div>
              {range === 'custom' && (
                <div className="tm__dates">
                  <input className="field" type="date" aria-label="Desde" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
                  <span className="muted">a</span>
                  <input className="field" type="date" aria-label="Hasta" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
                </div>
              )}
            </div>
          </div>
          <nav className="mx__nav" aria-label="Secciones">
            {SECTIONS.map(([id, label]) => <a key={id} className="chip chip--sm" href={`#${id}`}>{label}</a>)}
          </nav>
          <LaunchMetrics key={`${launchId}|${from}|${to}`} launchId={launchId} from={from} to={to} />
        </>
      )}
    </State>
  );
}

function LaunchMetrics({ launchId, from, to }: { launchId: string; from: string | null; to: string | null }) {
  const ads = useAsync(() => fetchAdsMetrics(launchId, from, to), [launchId, from, to]);
  useLiveReload([{ table: 'lead_launches', filter: `launch_id=eq.${launchId}` }, 'sales_calls', 'payments'], ads.reload, { delayMs: 5000 });
  const m = ads.data;
  const [meta, setMeta] = useState<MetaState | null>(null);
  const [tick, setTick] = useState(0);
  // Meta usa el rango ya resuelto por la base (sin rango = del primer día con datos a hoy).
  useEffect(() => {
    if (!m) return;
    let cancel = false;
    fetchMeta(launchId, m.desde, m.hasta, tick > 0)
      .then((r) => !cancel && setMeta(r))
      .catch((e) => !cancel && setMeta({ kind: 'error', error: (e as Error).message }));
    return () => {
      cancel = true;
    };
  }, [launchId, m?.desde, m?.hasta, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const metaState: MetaState = meta ?? { kind: 'error', error: 'Cargando datos de Meta…' };
  return (
    <State loading={ads.loading} error={ads.error}>
      {m && (
        <div className={`mx${ads.loading ? ' is-loading' : ''}`}>
          <div className="mx__meta muted">
            <span>Del {fmtDate(m.desde)} al {fmtDate(m.hasta)} · actualizado {fmtDateTime(m.generado)}{m.no_cuentan ? ` · ${m.no_cuentan} marcados «No cuentan» quedan afuera` : ''}</span>
            <button className="btn btn--ghost btn--sm" onClick={() => { ads.reload(); setTick((t) => t + 1); }}>Actualizar</button>
          </div>
          {meta && meta.kind !== 'ok' && <MetaNotice meta={meta} />}

          <Section id="pauta"><PautaSection m={m} meta={metaState} /></Section>
          <Section id="trafico">{meta ? <TrafficSection meta={meta} /> : <p className="muted">Cargando Meta…</p>}</Section>
          <Section id="anuncios">{meta ? <AdsSection meta={meta} /> : <p className="muted">Cargando Meta…</p>}</Section>
          <Section id="versiones"><LandingTestsSection from={from} to={to} meta={meta} /></Section>
          <Section id="fuentes"><SourcesSection m={m} /></Section>
          <Section id="respuestas"><AnswersSection m={m} /></Section>
          <Section id="despues"><AfterSection m={m} team={<TeamMetricsPanel launchId={launchId} fixedRange={{ from: m.desde, to: m.hasta }} />} /></Section>
          <Section id="ventas"><SalesSection m={m} /></Section>
        </div>
      )}
    </State>
  );
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  const [, label, tip] = SECTIONS.find((s) => s[0] === id)!;
  return (
    <section className="mx__section" aria-labelledby={id}>
      <SectionTitle id={id} tip={tip}>{label}</SectionTitle>
      {children}
    </section>
  );
}
