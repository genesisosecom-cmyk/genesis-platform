import { useState, type ReactNode } from 'react';
import { useAsync } from '../lib/useAsync';
import { fmtDate, fmtDateTime } from '../lib/format';
import { Pill, State } from '../admin/ui';
import InfoTip, { WithTip } from '../components/InfoTip';
import { useLiveReload } from '../lib/realtime';
import {
  CLOSER_DETAIL,
  CLOSER_KEY,
  fetchTeamMetrics,
  fmtMetric,
  isEmptyBaja,
  rangeDates,
  SDR_DETAIL,
  SDR_KEY,
  todayAR,
  type MetricDef,
  type MetricRow,
  type RangeKey,
} from './teamMetrics';

type Role = 'sdr' | 'closer';

const RANGES: [RangeKey, string][] = [
  ['hoy', 'Hoy'],
  ['7dias', '7 días'],
  ['todo', 'Todo el lanzamiento'],
  ['custom', 'Personalizado'],
];

const ESTADO_TONE = { activo: 'ok', pausado: 'warn', baja: 'muted' } as const;

/**
 * Tablero del equipo de ventas (crm_team_metrics). El superadmin ve a todos; una SDR o un closer,
 * solo su fila (lo filtra la base). `picker` es el selector de lanzamiento de la página.
 */
export default function TeamMetricsPanel({ launchId, picker, only, fixedRange }: { launchId: string; picker?: ReactNode; only?: Role; /** Rango que manda la página (oculta el selector propio). */ fixedRange?: { from: string | null; to: string | null } }) {
  const [range, setRange] = useState<RangeKey>('todo');
  const [custom, setCustom] = useState({ from: '', to: todayAR() });
  const { from, to } = fixedRange ?? rangeDates(range, custom);
  const { data, loading, error, reload } = useAsync(() => fetchTeamMetrics(launchId, from, to), [launchId, from, to]);
  useLiveReload(['lead_events', 'lead_launches', 'sales_calls', 'payments', 'sales_reps'], reload, { delayMs: 3000 });
  const sdr = (data?.sdr ?? []).filter((r) => !isEmptyBaja(r));
  const closer = (data?.closer ?? []).filter((r) => !isEmptyBaja(r));
  const roles: Role[] = only ? [only] : data ? (['sdr', 'closer'] as Role[]).filter((r) => (r === 'sdr' ? data.sdr : data.closer).length > 0) : [];
  const [picked, setPicked] = useState<Role | null>(only ?? null);
  const role = picked && roles.includes(picked) ? picked : roles[0] ?? 'sdr';
  const rows = role === 'sdr' ? sdr : closer;

  return (
    <section className="tm">
      {!fixedRange && <div className="toolbar">
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
        <div className="toolbar__right">
          <button className="btn btn--ghost" onClick={reload}>Actualizar</button>
        </div>
      </div>}

      {roles.length > 1 && (
        <nav className="tabs">
          {roles.map((r) => (
            <button key={r} type="button" className={`tabs__link tabs__btn${role === r ? ' active' : ''}`} onClick={() => setPicked(r)}>
              {r === 'sdr' ? `SDR · ${sdr.length}` : `Closer · ${closer.length}`}
            </button>
          ))}
        </nav>
      )}

      <State loading={loading} error={error}>
        {data && (
          <>
            {rows.length === 0 ? (
              <div className="state muted">No hay {role === 'sdr' ? 'SDRs' : 'closers'} con datos para mostrar.</div>
            ) : (
              <div className="stack">
                {rows.map((r) => <PersonCard key={r.id} row={r} role={role} />)}
                {role === 'sdr' && data.sin_asignar && data.sin_asignar.leads > 0 && (
                  <article className="glass panel tm__card">
                    <div className="panel__head"><h3 className="panel__title"><WithTip tip="Leads del período que todavía no tienen SDR.">Sin asignar</WithTip></h3></div>
                    <dl className="kv">
                      <div className="kv__row"><dt>Leads</dt><dd>{data.sin_asignar.leads}</dd></div>
                      <div className="kv__row"><dt><WithTip tip="Dijeron invertir 100 dólares por día o más.">Califican por inversión</WithTip></dt><dd>{data.sin_asignar.califican_por_inversion}</dd></div>
                      <div className="kv__row"><dt><WithTip tip="Completaron la aplicación post-clase.">Aplicaron</WithTip></dt><dd>{data.sin_asignar.aplicaron}</dd></div>
                    </dl>
                  </article>
                )}
              </div>
            )}
            <p className="muted tm__foot">
              {!from && !to ? 'Todo el lanzamiento' : from === to ? fmtDate(from) : `Del ${from ? fmtDate(from) : 'inicio'} al ${to ? fmtDate(to) : 'hoy'}`} · los leads se cuentan por fecha de registro y los dials y calls por fecha (hora de Argentina). Actualizado {fmtDateTime(data.generado)}.
            </p>
          </>
        )}
      </State>
    </section>
  );
}

function PersonCard({ row, role }: { row: MetricRow; role: Role }) {
  const key = role === 'sdr' ? SDR_KEY : CLOSER_KEY;
  const detail = role === 'sdr' ? SDR_DETAIL : CLOSER_DETAIL;
  const motivos = Object.entries((row.finalizados_por_motivo as Record<string, number> | undefined) ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <article className="glass panel tm__card">
      <div className="panel__head">
        <h3 className="panel__title">{row.nombre}</h3>
        {row.estado && <Pill tone={ESTADO_TONE[row.estado]}>{row.estado === 'activo' ? 'Activo' : row.estado === 'pausado' ? 'Pausado' : 'De baja'}</Pill>}
      </div>
      <div className="tm__key">
        {key.map((d) => <BigMetric key={d.key} def={d} value={row[d.key]} />)}
      </div>
      <div className="tm__detail">
        {detail.map((g) => (
          <section key={g.title} className="tm__group">
            <h4 className="tm__group-title">{g.title}</h4>
            <dl className="kv">
              {g.items.map((d) => (
                <div key={d.key} className="kv__row">
                  <dt><WithTip tip={d.tip}>{d.label}</WithTip></dt>
                  <dd>{fmtMetric(row[d.key], d.fmt)}</dd>
                </div>
              ))}
              {role === 'sdr' && g.items.some((d) => d.key === 'finalizados') && motivos.map(([k, v]) => (
                <div key={k} className="kv__row tm__sub">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </article>
  );
}

function BigMetric({ def, value }: { def: MetricDef; value: unknown }) {
  return (
    <div className="kpi tm__kpi">
      <span className="eyebrow with-tip">{def.label}<InfoTip text={def.tip} /></span>
      <span className="kpi__value">{fmtMetric(value, def.fmt)}</span>
    </div>
  );
}
