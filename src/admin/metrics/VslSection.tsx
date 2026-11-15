import { useState, type ReactNode } from 'react';
import { useAsync } from '../../lib/useAsync';
import { useLiveReload } from '../../lib/realtime';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { Kpi, Pill, State } from '../ui';
import { WithTip } from '../../components/InfoTip';
import { LineChart, SERIES_COLORS } from './charts';
import { fmt } from './defs';
import { confidence } from './landingTests';
import {
  arShort, currentAndPrevious, fetchVsl, fmtSeg, MIN_VISITAS_D1, shortName, syncVturb, totalsOf,
  type VslData, type VslPlayer, type VslTotals,
} from './vsl';

const TIPS = {
  plays: 'Reproducciones del player en vTurb (total_started), del día entero. Cuenta todas las páginas donde está el player.',
  play_rate: 'Reproducciones sobre visitas de las versiones con video (d1, y a1, a2, b1… por link fijo) dentro del período del VSL.',
  promedio: 'Tiempo promedio visto por los que dieron play, según vTurb.',
  retencion: 'Qué % de los que dieron play sigue mirando en ese punto del video (curva de vTurb, sumando los días).',
  pitch: 'Qué % de los que dieron play llegó al segundo del pitch configurado en vTurb.',
  clicks: 'Clicks en el botón del player (CTA) sobre reproducciones.',
  conversion: 'Opt-ins sobre visitas de d1.',
  cal_visita: 'Calificados (invierten 100 dólares por día o más en Meta) sobre visitas.',
};

const fuenteLabel = { manual: 'cargada a mano', merge: 'hora de publicación de la landing', primer_play: 'primer play en vTurb' } as const;

export default function VslSection() {
  const [fuente, setFuente] = useState<VslData['fuente']>('todas');
  const q = useAsync(() => fetchVsl(fuente), [fuente]);
  useLiveReload(['lead_launches'], q.reload, { delayMs: 5000 });
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const d = q.data;

  const sync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await syncVturb();
      if (r.falta?.length) setSyncMsg('Falta cargar el token de vTurb (secreto VTURB_API_TOKEN en Supabase).');
      else if (!r.ok) setSyncMsg(`No se pudo traer vTurb: ${r.error ?? 'error desconocido'}`);
      else setSyncMsg(null);
      q.reload();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <div className="lt__filters">
        <div className="seg">
          {([['todas', 'Todas las fuentes'], ['pauta', 'Pauta'], ['organico', 'Orgánico']] as const).map(([k, l]) => (
            <button key={k} type="button" className={`seg__opt${fuente === k ? ' is-on' : ''}`} onClick={() => setFuente(k)}>{l}</button>
          ))}
        </div>
        <span className="muted vsl__sync">
          {d?.sync.ultimo
            ? <>vTurb: {d.sync.ultimo.ok ? `actualizado ${fmtDateTime(d.sync.ultimo.at)}` : `error ${fmtDateTime(d.sync.ultimo.at)}`}{!d.sync.ultimo.ok && d.sync.ultimo_ok ? ` · último bien ${fmtDateTime(d.sync.ultimo_ok)}` : ''}</>
            : 'vTurb: todavía no se trajo nada'}
          {' · '}se actualiza solo cada hora
        </span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={sync} disabled={syncing}>{syncing ? 'Trayendo…' : 'Actualizar vTurb'}</button>
      </div>
      {syncMsg && <p className="vsl__warn">{syncMsg}</p>}
      {d?.sync.ultimo && !d.sync.ultimo.ok && <p className="vsl__warn">Última corrida con error: {d.sync.ultimo.detalle}</p>}

      <State loading={q.loading} error={q.error}>
        {d && <VslBody data={d} />}
      </State>
    </>
  );
}

function VslBody({ data }: { data: VslData }) {
  const { current, previous, sorted } = currentAndPrevious(data.players);
  if (!current) return <div className="state muted">No hay ningún VSL cargado.</div>;
  const leaks = sorted.filter((p) => p.hasta && (p.plays_despues ?? 0) > 0);
  const t = totalsOf(current);
  const noVturb = !current.sincronizado_at;

  return (
    <div className="lt">
      {leaks.map((p) => (
        <p key={p.player_id} className="vsl__warn">
          ⚠ El player de <strong>{p.nombre}</strong> ({p.player_id}) tuvo {fmt(p.plays_despues, 'num')} reproducciones después de salir de la landing ({fmtDateTime(p.hasta)}).
          Puede haber una página que todavía tiene el player viejo.
        </p>
      ))}

      <div className="glass panel">
        <div className="panel__head">
          <h3 className="panel__title">{current.nombre}</h3>
          <Pill tone="accent">En la landing</Pill>
        </div>
        <p className="muted lt__desc">
          Desde el {fmtDateTime(current.desde)} ({fuenteLabel[current.desde_fuente]}). Player {current.player_id}
          {current.duracion_seg ? ` · dura ${fmtSeg(current.duracion_seg)}` : ''}
          {current.pitch_seg ? ` · pitch en ${fmtSeg(current.pitch_seg)}` : current.sincronizado_at ? ' · sin pitch configurado en vTurb' : ''}.
        </p>
        {noVturb && <p className="vsl__warn">Todavía no hay datos de vTurb: falta el token o la primera corrida. Los números del campus (d1) ya están.</p>}
        <div className="kpis vsl__kpis">
          <Kpi label="Reproducciones" value={fmt(t.plays, 'num')} hint={<WithTip tip={TIPS.plays}>{t.dias} {t.dias === 1 ? 'día' : 'días'}</WithTip>} />
          <Kpi label="Play rate" value={fmt(t.play_rate, 'pct')} hint={<WithTip tip={TIPS.play_rate}>{fmt(t.visitas_con_video, 'num')} visitas con video</WithTip>} />
          <Kpi label="Tiempo promedio" value={fmtSeg(t.promedio_visto_seg)} hint={current.duracion_seg && t.promedio_visto_seg !== null ? `${fmt((t.promedio_visto_seg / current.duracion_seg) * 100, 'pct')} del video` : undefined} />
          <Kpi label="Llegan al pitch" value={fmt(t.pct_pitch ?? t.retencion?.pitch ?? null, 'pct')} hint={<WithTip tip={TIPS.pitch}>{!t.con_vturb ? 'sin datos de vTurb' : current.pitch_seg ? `${fmt(t.sobre_pitch, 'num')} personas` : 'sin pitch en vTurb'}</WithTip>} />
          <Kpi label="Clicks en CTA" value={fmt(t.pct_clicks, 'pct')} hint={<WithTip tip={TIPS.clicks}>{t.con_vturb ? `${fmt(t.clicks, 'num')} clicks` : 'sin datos de vTurb'}</WithTip>} />
        </div>
        <RetentionRow t={t} />
        <div className="kpis vsl__kpis">
          <Kpi label="d1 · visitas" value={fmt(t.d1.visitas, 'num')} hint={t.d1.visitas < MIN_VISITAS_D1 ? <span className="lt__low">Poca muestra</span> : undefined} />
          <Kpi label="d1 · opt-ins" value={fmt(t.d1.registros, 'num')} hint={<WithTip tip={TIPS.conversion}>{fmt(t.d1.conversion, 'pct')} conversión</WithTip>} />
          <Kpi label="d1 · calificados" value={fmt(t.d1.calificados, 'num')} hint={<WithTip tip={TIPS.cal_visita}>{fmt(t.d1.cal_por_visita, 'pct')} por visitante</WithTip>} />
          <Kpi label="d1 · grupo WhatsApp" value={fmt(t.d1.grupo, 'num')} hint={`${fmt(t.d1.pct_grupo, 'pct')} de los opt-ins`} />
        </div>
      </div>

      <h3 className="section-title section-title--sm">{shortName(current)} por día</h3>
      <DailyTable p={current} />

      <h3 className="section-title section-title--sm">
        <WithTip tip="Solo d1, cada VSL en su período (cortado en la hora del cambio). Las visitas de antes del 12/11 15:12 son totales por día.">d1 con cada VSL</WithTip>
      </h3>
      <VslCompare players={sorted.filter((p) => p.dias.some((x) => x.en_periodo))} highlight={[current.player_id, previous?.player_id].filter(Boolean) as string[]} />

      <h3 className="section-title section-title--sm">
        <WithTip tip="Las dos versiones del link /clase en el mismo período: desde que se publicó el VSL actual.">d1 ({shortName(current)}) contra d3 (sin video)</WithTip>
      </h3>
      <D1vsD3 p={current} t={t} />

      <RetentionChart players={sorted} />

      <PlayersTable players={sorted} />
    </div>
  );
}

function RetentionRow({ t }: { t: VslTotals }) {
  const r = t.retencion;
  return (
    <div className="vsl__ret">
      <span className="muted"><WithTip tip={TIPS.retencion}>Siguen mirando</WithTip></span>
      {([25, 50, 75, 100] as const).map((k) => (
        <span key={k} className="vsl__retcell"><span className="muted">al {k}%</span> <strong>{fmt(r?.at[k] ?? null, 'pct')}</strong></span>
      ))}
      {t.pct_terminaron !== null && <span className="muted vsl__retcell">· terminaron (vTurb): {fmt(t.pct_terminaron, 'pct')}</span>}
    </div>
  );
}

function DailyTable({ p }: { p: VslPlayer }) {
  const days = p.dias.filter((d) => d.en_periodo).slice().reverse();
  if (!days.length) return <p className="muted">Sin días todavía.</p>;
  return (
    <div className="glass table-wrap">
      <table className="table table--num vsl__table">
        <thead>
          <tr>
            <th>Día</th><th>Plays</th><th>Play rate</th><th>Prom. visto</th><th>25%</th><th>50%</th><th>75%</th><th>100%</th><th>Pitch</th>
            <th>d1 visitas</th><th>Opt-ins</th><th>Conv.</th><th>Calif.</th><th>Calif./visita</th><th>Grupo</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const t = totalsOf(p, [d]);
            const parcial = d.desde && d.hasta && (Date.parse(d.hasta) - Date.parse(d.desde) < 86_000_000);
            return (
              <tr key={d.dia}>
                <td>{fmtDate(d.dia)}{parcial && <div className="cell-sub">{hhmm(d.desde)}–{hhmm(d.hasta)}</div>}</td>
                <td>{fmt(t.plays, 'num')}</td>
                <td>{fmt(t.play_rate, 'pct')}</td>
                <td>{fmtSeg(t.promedio_visto_seg)}</td>
                <td>{fmt(t.retencion?.at[25] ?? null, 'pct')}</td>
                <td>{fmt(t.retencion?.at[50] ?? null, 'pct')}</td>
                <td>{fmt(t.retencion?.at[75] ?? null, 'pct')}</td>
                <td>{fmt(t.retencion?.at[100] ?? null, 'pct')}</td>
                <td>{fmt(t.pct_pitch, 'pct')}</td>
                <td>{fmt(t.d1.visitas, 'num')}</td>
                <td>{fmt(t.d1.registros, 'num')}</td>
                <td>{fmt(t.d1.conversion, 'pct')}</td>
                <td>{fmt(t.d1.calificados, 'num')}</td>
                <td>{fmt(t.d1.cal_por_visita, 'pct')}</td>
                <td>{fmt(t.d1.grupo, 'num')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }) : '');

type Row = { label: ReactNode; get: (t: VslTotals) => ReactNode };

const COMPARE_ROWS: Row[] = [
  { label: 'Visitas d1', get: (t) => fmt(t.d1.visitas, 'num') },
  { label: 'Opt-ins', get: (t) => fmt(t.d1.registros, 'num') },
  { label: <WithTip tip={TIPS.conversion}>Conversión</WithTip>, get: (t) => fmt(t.d1.conversion, 'pct') },
  { label: 'Calificados', get: (t) => fmt(t.d1.calificados, 'num') },
  { label: <WithTip tip={TIPS.cal_visita}>Calificados por visitante</WithTip>, get: (t) => fmt(t.d1.cal_por_visita, 'pct') },
  { label: '% calificados', get: (t) => fmt(t.d1.pct_calificados, 'pct') },
  { label: 'Grupo WhatsApp', get: (t) => `${fmt(t.d1.grupo, 'num')} (${fmt(t.d1.pct_grupo, 'pct')})` },
  { label: <WithTip tip={TIPS.plays}>Reproducciones</WithTip>, get: (t) => fmt(t.plays, 'num') },
  { label: <WithTip tip={TIPS.play_rate}>Play rate</WithTip>, get: (t) => fmt(t.play_rate, 'pct') },
  { label: 'Tiempo promedio', get: (t) => fmtSeg(t.promedio_visto_seg) },
  { label: 'Siguen al 25%', get: (t) => fmt(t.retencion?.at[25] ?? null, 'pct') },
  { label: 'Siguen al 50%', get: (t) => fmt(t.retencion?.at[50] ?? null, 'pct') },
  { label: 'Siguen al 75%', get: (t) => fmt(t.retencion?.at[75] ?? null, 'pct') },
  { label: 'Siguen al 100%', get: (t) => fmt(t.retencion?.at[100] ?? null, 'pct') },
  { label: <WithTip tip={TIPS.pitch}>Llegan al pitch</WithTip>, get: (t) => fmt(t.pct_pitch, 'pct') },
  { label: <WithTip tip={TIPS.clicks}>Clicks en CTA</WithTip>, get: (t) => fmt(t.pct_clicks, 'pct') },
];

function VslCompare({ players, highlight }: { players: VslPlayer[]; highlight: string[] }) {
  const cols = players.map((p) => ({ p, t: totalsOf(p) }));
  const [a, b] = highlight.map((id) => cols.find((c) => c.p.player_id === id)).filter(Boolean) as typeof cols;
  return (
    <div className="glass panel lt__h2h">
      <div className="table-wrap">
        <table className="table table--num vsl__cmp">
          <thead>
            <tr>
              <th />
              {cols.map(({ p, t }) => (
                <th key={p.player_id}>
                  {shortName(p)}
                  <div className="cell-sub lt__sub">{periodo(p)}</div>
                  {t.d1.visitas < MIN_VISITAS_D1 && <div><Pill tone="warn">Poca muestra</Pill></div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((r, i) => (
              <tr key={i}><td>{r.label}</td>{cols.map(({ p, t }) => <td key={p.player_id}>{r.get(t)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {a && b && <Verdict a={{ name: shortName(a.p), t: a.t.d1 }} b={{ name: shortName(b.p), t: b.t.d1 }} />}
    </div>
  );
}

function D1vsD3({ p, t }: { p: VslPlayer; t: VslTotals }) {
  const rows: [ReactNode, ReactNode, ReactNode][] = [
    ['Visitas', fmt(t.d1.visitas, 'num'), fmt(t.d3.visitas, 'num')],
    ['Opt-ins', fmt(t.d1.registros, 'num'), fmt(t.d3.registros, 'num')],
    [<WithTip key="c" tip="Opt-ins sobre visitas.">Conversión</WithTip>, fmt(t.d1.conversion, 'pct'), fmt(t.d3.conversion, 'pct')],
    ['Calificados', fmt(t.d1.calificados, 'num'), fmt(t.d3.calificados, 'num')],
    [<WithTip key="v" tip={TIPS.cal_visita}>Calificados por visitante</WithTip>, fmt(t.d1.cal_por_visita, 'pct'), fmt(t.d3.cal_por_visita, 'pct')],
    ['% calificados', fmt(t.d1.pct_calificados, 'pct'), fmt(t.d3.pct_calificados, 'pct')],
    ['Grupo WhatsApp', `${fmt(t.d1.grupo, 'num')} (${fmt(t.d1.pct_grupo, 'pct')})`, `${fmt(t.d3.grupo, 'num')} (${fmt(t.d3.pct_grupo, 'pct')})`],
    ['Play rate', fmt(t.play_rate, 'pct'), 'sin video'],
    ['Siguen al 50% del video', fmt(t.retencion?.at[50] ?? null, 'pct'), 'sin video'],
  ];
  return (
    <div className="glass panel lt__h2h">
      <p className="muted lt__note">Desde el {fmtDateTime(p.desde)}. El link /clase reparte 50/50, así que las dos tienen el mismo tráfico.</p>
      <div className="table-wrap">
        <table className="table table--num vsl__cmp">
          <thead>
            <tr>
              <th />
              <th>d1<div className="cell-sub lt__sub">con {shortName(p)}</div>{t.d1.visitas < MIN_VISITAS_D1 && <div><Pill tone="warn">Poca muestra</Pill></div>}</th>
              <th>d3<div className="cell-sub lt__sub">sin video</div>{t.d3.visitas < MIN_VISITAS_D1 && <div><Pill tone="warn">Poca muestra</Pill></div>}</th>
            </tr>
          </thead>
          <tbody>{rows.map((r, i) => <tr key={i}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
        </table>
      </div>
      <Verdict a={{ name: 'd1', t: t.d1 }} b={{ name: 'd3', t: t.d3 }} />
    </div>
  );
}

/** Quién va mejor en conversión y en calificados por visitante, con su confianza (o «poca muestra»). */
function Verdict({ a, b }: { a: { name: string; t: VslTotals['d1'] }; b: { name: string; t: VslTotals['d1'] } }) {
  if (a.t.visitas < MIN_VISITAS_D1 || b.t.visitas < MIN_VISITAS_D1) {
    return <p className="muted lt__note">Poca muestra (menos de {MIN_VISITAS_D1} visitas en {a.t.visitas < MIN_VISITAS_D1 ? a.name : b.name}): todavía no se puede sacar una conclusión.</p>;
  }
  const line = (label: string, ka: number, kb: number) => {
    const ra = ka / a.t.visitas, rb = kb / b.t.visitas;
    const conf = confidence(ka, a.t.visitas, kb, b.t.visitas);
    if (ra === rb) return <p className="lt__winner"><span className="muted">{label}:</span> empatan.</p>;
    const [w, l] = ra > rb ? [a.name, b.name] : [b.name, a.name];
    const ok = conf !== null && conf >= 95;
    return (
      <p className="lt__winner">
        <span className="muted">{label}:</span> <strong>{w}</strong> va mejor que {l}
        <span className="muted"> · {fmt(conf, 'pct')} de confianza{ok ? '' : ' (todavía no es confiable, hace falta 95%)'}</span>
      </p>
    );
  };
  return (
    <div className="lt__winners">
      {line('Conversión', a.t.registros, b.t.registros)}
      {line('Calificados por visitante', a.t.calificados, b.t.calificados)}
    </div>
  );
}

function RetentionChart({ players }: { players: VslPlayer[] }) {
  const series = players
    .map((p) => ({ p, r: totalsOf(p).retencion }))
    .filter((x) => x.r)
    .slice(0, 3)
    .map((x, i) => ({ name: shortName(x.p), color: SERIES_COLORS[i], values: x.r!.curve }));
  if (!series.length) return null;
  const xs = Array.from({ length: 101 }, (_, i) => String(i));
  return (
    <div className="glass panel">
      <h3 className="panel__title"><WithTip tip="% de los que dieron play que sigue mirando en cada punto del video (en % de la duración, para comparar videos de distinto largo). Cada VSL en su período.">Retención del video</WithTip></h3>
      <LineChart days={xs} series={series} format={(v) => fmt(v, 'pct')} xLabel={(k) => `${k}%`} label="Retención de cada VSL en % del video" />
    </div>
  );
}

function PlayersTable({ players }: { players: VslPlayer[] }) {
  return (
    <div className="glass panel">
      <h3 className="panel__title"><WithTip tip="Salen de la tabla vsl_players. Para cambiar de VSL: poner «hasta» en el actual y agregar una fila con el player nuevo.">VSL cargados</WithTip></h3>
      <div className="table-wrap">
        <table className="table vsl__players">
          <thead><tr><th>VSL</th><th>Player / video</th><th>Período</th><th>Duración</th><th>Después de salir</th></tr></thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.player_id}>
                <td>{p.nombre}</td>
                <td><code>{p.player_id}</code><div className="cell-sub">{p.video_id}</div></td>
                <td>{periodo(p)}<div className="cell-sub">inicio: {fuenteLabel[p.desde_fuente]}</div></td>
                <td>{fmtSeg(p.duracion_seg)}{p.pitch_seg ? <div className="cell-sub">pitch {fmtSeg(p.pitch_seg)}</div> : null}</td>
                <td>{p.hasta ? (p.plays_despues === null ? '—' : p.plays_despues > 0 ? <Pill tone="warn">{p.plays_despues} plays</Pill> : <Pill tone="ok">0 plays</Pill>) : <span className="muted">en la landing</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const periodo = (p: VslPlayer) => `${arShort(p.desde)} → ${p.hasta ? arShort(p.hasta) : 'hoy'}`;
