import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Paleta de series validada para daltonismo sobre el fondo oscuro (azul, naranja, verde agua). */
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70'];
export const GOOD = '#0ca30c';
export const BAD = '#d03b3b';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

export interface Series {
  name: string;
  color: string;
  values: (number | null)[];
}

const shortDay = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
};

/** Líneas por día. Una sola escala (nunca dos ejes). Crosshair + tooltip con todas las series. */
export function LineChart({ days, series, format, height = 220, label, xLabel = shortDay, markers = [] }: {
  days: string[];
  series: Series[];
  format: (v: number | null) => string;
  height?: number;
  label: string;
  /** Cómo se escribe cada valor del eje X (por defecto, día d/m). */
  xLabel?: (k: string) => string;
  /** Marcas verticales (cambios en la página): posición en el eje X y texto. */
  markers?: { i: number; label: string }[];
}) {
  const { ref, w } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 44, r: series.length > 1 ? 34 : 14, t: 12, b: 26 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const max = Math.max(1, ...all);
  const nice = niceMax(max);
  const x = (i: number) => pad.l + (days.length <= 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / nice) * ih;
  const ticks = [0, nice / 2, nice];
  const every = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(iw / 56))));

  const pick = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const rel = clientX - r.left - pad.l;
    const i = days.length <= 1 ? 0 : Math.round((rel / iw) * (days.length - 1));
    setHover(Math.min(days.length - 1, Math.max(0, i)));
  };

  if (!days.length) return <p className="muted">Sin datos en el rango.</p>;
  return (
    <div className="chart" ref={ref}>
      {series.length > 1 && (
        <div className="chart__legend">
          {series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}
        </div>
      )}
      <svg width={w} height={height} role="img" aria-label={label}
        onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="chart__grid" />
            <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="chart__axis">{format(t)}</text>
          </g>
        ))}
        {days.map((d, i) => (i % every === 0 || i === days.length - 1) && (
          <text key={d} x={x(i)} y={height - 8} textAnchor="middle" className="chart__axis">{xLabel(d)}</text>
        ))}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`));
          const segs: string[][] = [[]];
          pts.forEach((p) => (p ? segs[segs.length - 1].push(p) : segs.push([])));
          const lastI = s.values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop();
          return (
            <g key={s.name}>
              {segs.filter((sg) => sg.length).map((sg, k) => (sg.length === 1
                ? <circle key={k} cx={sg[0].split(',')[0]} cy={sg[0].split(',')[1]} r={4} fill={s.color} />
                : <polyline key={k} points={sg.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />))}
              {series.length > 1 && lastI !== undefined && (
                <text x={x(lastI) + 6} y={y(s.values[lastI]!)} dy="0.32em" className="chart__direct">{s.name.split(' ').pop()}</text>
              )}
            </g>
          );
        })}
        {markers.map((m, k) => (
          <g key={`m${k}`} className="chart__marker">
            <line x1={x(m.i)} x2={x(m.i)} y1={pad.t} y2={pad.t + ih} />
            <text x={x(m.i)} y={pad.t + 2} textAnchor="middle">◆</text>
            <title>{m.label}</title>
          </g>
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="chart__cross" />
            {series.map((s) => s.values[hover] !== null && (
              <circle key={s.name} cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={s.color} stroke="#0e0b09" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="chart__tip" style={{ left: Math.min(w - 170, Math.max(0, x(hover) + 10)) }}>
          <div className="chart__tip-day">{xLabel(days[hover])}</div>
          {markers.filter((m) => m.i === hover).map((m, k) => <div key={k} className="chart__tip-event">◆ {m.label}</div>)}
          {series.map((s) => (
            <div key={s.name} className="chart__tip-row"><i style={{ background: s.color }} /><strong>{format(s.values[hover])}</strong><span>{s.name}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

function niceMax(v: number) {
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e;
}

/** Barras horizontales: reparto de una cantidad (inversión, país, estado, intentos…). */
export function BarList({ rows, total, extra }: { rows: { label: string; value: number; sub?: ReactNode }[]; total?: number; extra?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const sum = total ?? rows.reduce((s, r) => s + r.value, 0);
  if (!rows.length) return <p className="muted">Sin datos en el rango.</p>;
  return (
    <ul className="barlist">
      {extra && <li className="barlist__head muted">{extra}</li>}
      {rows.map((r) => (
        <li key={r.label} className="barlist__row" title={`${r.label}: ${r.value}`}>
          <span className="barlist__label">{r.label}</span>
          <span className="barlist__track"><span className="barlist__bar" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="barlist__value"><strong>{r.value.toLocaleString('es-AR')}</strong>{sum ? <span className="muted"> · {Math.round((r.value / sum) * 100)}%</span> : null}{r.sub}</span>
        </li>
      ))}
    </ul>
  );
}

/** Embudo: cada paso con su cantidad y el % que sigue desde el paso anterior. */
export function Funnel({ steps }: { steps: { label: ReactNode; value: number | null; key: string; /** Paso contra el que se compara (por defecto, el anterior) y cómo se llama. */ of?: string; ofLabel?: string }[] }) {
  const first = steps.find((s) => s.value !== null)?.value ?? 0;
  return (
    <ol className="funnel">
      {steps.map((s, i) => {
        const base = s.of ? steps.find((x) => x.key === s.of) : i > 0 ? steps[i - 1] : null;
        const prev = base ? base.value : null;
        const pct = s.value !== null && prev ? Math.round((s.value / prev) * 1000) / 10 : null;
        return (
          <li key={s.key} className="funnel__step">
            <div className="funnel__label">{s.label}</div>
            <div className="funnel__track"><span className="funnel__bar" style={{ width: `${first && s.value !== null ? Math.max(1.5, (s.value / first) * 100) : 0}%` }} /></div>
            <div className="funnel__value">
              <strong>{s.value === null ? '—' : s.value.toLocaleString('es-AR')}</strong>
              {i > 0 && <span className="muted">{pct === null ? '—' : `${pct.toLocaleString('es-AR')}%`} {s.of ? `de ${s.ofLabel ?? s.of}` : 'del paso anterior'}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Flecha de hoy contra ayer: ▲/▼ con color solo si se sabe si es bueno; siempre con texto para lectores. */
export function TrendArrow({ t }: { t: { dir: 'up' | 'down' | 'same'; good: boolean | null } | null }) {
  if (!t) return null;
  if (t.dir === 'same') return <span className="trend muted" title="Igual que ayer">= ayer</span>;
  const color = t.good === null ? undefined : t.good ? GOOD : BAD;
  const word = t.good === null ? '' : t.good ? ' (mejora)' : ' (empeora)';
  return (
    <span className="trend" style={{ color }} title={`${t.dir === 'up' ? 'Subió' : 'Bajó'} contra ayer${word}`}>
      {t.dir === 'up' ? '▲' : '▼'} vs. ayer
    </span>
  );
}
