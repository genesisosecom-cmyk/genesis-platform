import { Link } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { useLiveReload } from '../../lib/realtime';
import { fmtMoney } from '../../lib/format';
import { Kpi } from '../ui';
import { useFunnels } from '../../funnels/FunnelContext';
import { fetchFunnelOverview, type FunnelOverview } from '../../funnels/api';
import type { Funnel } from '../../lib/types';

/** Cómo se muestra cada KPI de funnels.config.kpis. */
const KPI_DEFS: Record<string, { label: string; value: (o: FunnelOverview) => string | number; hint?: (o: FunnelOverview) => string | undefined; tone?: 'ok' }> = {
  optins: { label: 'Registros', value: (o) => o.optins.toLocaleString('es-AR') },
  calificados: { label: 'Calificados', value: (o) => o.calificados, tone: 'ok' },
  aplicaciones: { label: 'Aplicaciones', value: (o) => o.aplicaciones },
  llamadas: { label: 'Llamadas', value: (o) => o.llamadas },
  cierres: { label: 'Cierres', value: (o) => o.cierres, hint: (o) => o.cierres_por_programa.map((p) => `${p.ventas} ${p.programa}`).join(' · ') || undefined },
  cierres_os: { label: 'Cierres OS', value: (o) => o.cierres_os, tone: 'ok' },
  cierres_lite: { label: 'Cierres Lite', value: (o) => o.cierres_lite },
  cash: { label: 'Caja', value: (o) => fmtMoney(Number(o.cash), 'USD'), tone: 'ok' },
  conversaciones_por_palabra: {
    label: 'Conversaciones por palabra',
    value: (o) => o.conversaciones,
    hint: (o) => Object.entries(o.conversaciones_por_palabra).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ') || 'Todavía no entró ninguna palabra',
  },
  conversaciones_calificadas: { label: 'Conversaciones calificadas', value: (o) => o.conversaciones_calificadas, tone: 'ok', hint: () => 'Vende hoy + capital para OS' },
};
const DEFAULT_KPIS = ['calificados', 'aplicaciones', 'llamadas', 'cierres', 'cash'];

/**
 * Ventas por funnel en el Resumen. Con «Todos»: caja y ventas consolidadas y una tarjeta por funnel.
 * Con un funnel elegido: sus KPIs (los de funnels.config.kpis).
 */
export default function FunnelOverviewSection() {
  const { funnels, funnel, setFunnel, loading } = useFunnels();
  const key = funnel?.id ?? `all:${funnels.map((f) => f.id).join(',')}`;
  const { data, error, reload } = useAsync(
    () => (funnel ? fetchFunnelOverview(funnel.id).then((o) => [o]) : Promise.all([fetchFunnelOverview(null), ...funnels.map((f) => fetchFunnelOverview(f.id))])),
    [key],
  );
  useLiveReload(['sales_calls', 'payments', 'lead_launches'], reload, { delayMs: 4000 });
  if (loading || !funnels.length) return null;
  if (error) return <p className="state--error">Funnels: {error}</p>;
  if (!data) return null;

  if (funnel) {
    const o = data[0];
    const kpis = (funnel.config.kpis ?? DEFAULT_KPIS).filter((k) => KPI_DEFS[k]);
    return (
      <section style={{ marginBottom: 28 }}>
        <h2 className="section-title section-title--sm">{funnel.name} · todos sus ciclos</h2>
        <div className="kpis fkpis">
          {kpis.map((k) => <Kpi key={k} label={KPI_DEFS[k].label} value={KPI_DEFS[k].value(o)} hint={KPI_DEFS[k].hint?.(o)} tone={KPI_DEFS[k].tone} />)}
        </div>
      </section>
    );
  }

  const [total, ...each] = data;
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="section-title section-title--sm">Ventas · todos los funnels</h2>
      <div className="kpis kpis--4">
        <Kpi label="Caja" value={fmtMoney(Number(total.cash), 'USD')} tone="ok" />
        <Kpi label="Ventas" value={total.cierres} hint={total.cierres_por_programa.map((p) => `${p.ventas} ${p.programa}`).join(' · ') || undefined} />
        <Kpi label="Llamadas" value={total.llamadas} />
        <Kpi label="Leads" value={total.leads.toLocaleString('es-AR')} hint={`${total.calificados} calificados`} />
      </div>
      <div className="fcards">
        {funnels.map((f: Funnel, i) => {
          const o = each[i];
          return (
            <button key={f.id} type="button" className="glass fcard" onClick={() => setFunnel(f.id)} title={`Ver ${f.name}`}>
              <span className="eyebrow">{f.kind === 'webinar' ? 'Webinar' : f.kind === 'evergreen' ? 'Evergreen' : 'Funnel'}</span>
              <span className="fcard__name">{f.name}</span>
              <span className="fcard__cash">{fmtMoney(Number(o.cash), 'USD')}</span>
              <span className="muted">{o.cierres} venta(s) · {o.llamadas} llamada(s) · {o.leads.toLocaleString('es-AR')} leads · {o.calificados} calificados</span>
            </button>
          );
        })}
      </div>
      <p className="muted" style={{ marginTop: 10 }}>Elegí un funnel arriba para ver sus leads, tareas y métricas. Las tareas de cada uno están en <Link className="link" to="/admin/tareas">Tareas</Link>.</p>
    </section>
  );
}
