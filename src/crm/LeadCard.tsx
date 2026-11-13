import { useState, type ReactNode } from 'react';
import CallScheduler from './CallScheduler';
import { Pill } from '../admin/ui';
import { fmtDate, fmtDateTime } from '../lib/format';
import type { CrmAgent, LeadEvent, SalesRep } from '../lib/types';
import {
  claimLead,
  dial,
  fetchLeadEvents,
  finalizeLead,
  releaseLead,
  moveLead,
  reopenLead,
  scheduleCall,
  setNoCuenta,
  updateLead,
  followupDone,
  type LeadPatch,
  type LeadRow,
} from './api';
import {
  CADENCES,
  CADENCE_STEPS,
  currentList,
  daysAgo,
  FINALIZE_REASONS,
  followupDue,
  followupWhy,
  inFollowup,
  isBooked,
  isFinalized,
  isNoCuenta,
  leadLevel,
  LEVEL_LABEL,
  MOVE_TARGETS,
  NO_CUENTA_REASONS,
  stageOf,
  summaryLine,
} from './model';
import { AgentsModal } from './modals';
import { Timeline, WhatsAppButton } from './components';
import InfoTip, { WithTip } from '../components/InfoTip';
import { LEAD_TIPS as T } from './tips';

export interface CardContext {
  reps: SalesRep[];
  agents: CrmAgent[];
  launchStartsAt: string | null;
  /** id del SDR que mira (null si no es SDR). */
  me: string | null;
  isAdmin: boolean;
  /** Recarga esta fila después de un cambio. */
  refresh: (id: string) => void;
}

const LEVEL_TONE = { alto: 'ok', medio: 'accent', potencial: 'muted' } as const;

function YesNo({ value, onChange, disabled, allowNull }: { value: boolean | null; onChange: (v: boolean | null) => void; disabled: boolean; allowNull?: boolean }) {
  const opts: [boolean | null, string][] = allowNull ? [[true, 'Sí'], [false, 'No'], [null, '—']] : [[true, 'Sí'], [false, 'No']];
  return (
    <div className="seg">
      {opts.map(([v, l]) => (
        <button key={l} type="button" disabled={disabled} className={`seg__opt${value === v ? ' is-on' : ''}`} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

function Row({ label, tip, children }: { label: string; tip?: string; children: ReactNode }) {
  return (
    <div className="wk__row">
      <span className="wk__label"><WithTip tip={tip}>{label}</WithTip></span>
      <div className="wk__ctl">{children}</div>
    </div>
  );
}

/** Tarjeta del lead: todo se edita acá y queda en el historial. */
export default function LeadCard({ row, ctx, defaultOpen = false }: { row: LeadRow; ctx: CardContext; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(row.sdr_notes ?? '');
  const [events, setEvents] = useState<LeadEvent[] | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [panel, setPanel] = useState<null | 'agendar' | 'finalizar' | 'no_cuenta' | 'seguimiento'>(null);
  const [fuNote, setFuNote] = useState('');
  const [agentsOpen, setAgentsOpen] = useState(false);

  const l = row.lead;
  const owner = l.sdr_id ? ctx.reps.find((r) => r.id === l.sdr_id) : null;
  const mine = Boolean(ctx.me && l.sdr_id === ctx.me);
  const canEdit = mine || ctx.isAdmin;
  const canClaim = !l.sdr_id && Boolean(ctx.me) && !isNoCuenta(row);
  const level = leadLevel(row);
  const closers = ctx.reps.filter((r) => r.closer_status === 'activo');
  const repName = (id: string | null) => (id ? ctx.reps.find((r) => r.id === id)?.name ?? null : null);
  const due = followupDue(row);
  const appInv = (row.application as { inversion?: string } | null)?.inversion;

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after?.();
      ctx.refresh(row.id);
      if (showEvents) setEvents(await fetchLeadEvents(row.lead_id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const patch = (p: LeadPatch) => run(() => updateLead(row.id, p));
  // Para saber si califica la SDR tuvo que hablar con el lead: si «¿Contestó?» no estaba en Sí, se marca junto.
  const qualify = (v: boolean | null) => patch(v !== null && row.answered !== true ? { sdr_qualified: v, answered: true } : { sdr_qualified: v });

  const toggleEvents = async () => {
    const next = !showEvents;
    setShowEvents(next);
    if (next && !events) setEvents(await fetchLeadEvents(row.lead_id));
  };

  return (
    <article className={`lcard glass${open ? ' is-open' : ''}${due ? ' is-due' : ''}`}>
      <header className="lcard__head" onClick={() => setOpen((o) => !o)}>
        <div className="lcard__title">
          <strong>{l.full_name || l.email || `+${l.phone}`}</strong>
          <span className="with-tip"><Pill tone={LEVEL_TONE[level]}>{LEVEL_LABEL[level]}</Pill><InfoTip text={T.level} /></span>
          <span className="with-tip"><Pill tone="muted">{stageOf(row, ctx.launchStartsAt)}</Pill><InfoTip text={T.stage} /></span>
          {row.sdr_qualified === true && <Pill tone="ok">Calificado real</Pill>}
          {row.sdr_qualified === false && <Pill tone="warn">No califica</Pill>}
          {row.route === 'aplicado' && <Pill tone="ok">Aplicó</Pill>}
          {row.class_confirmed_at && <Pill tone="ok">Confirmó la clase</Pill>}
          {row.send_resource_at && <Pill tone="accent">Enviar recurso</Pill>}
          {row.asked_agents && <Pill tone="accent">Pidió agentes</Pill>}
          {l.possible_duplicate && <Pill tone="warn">Posible duplicado</Pill>}
        </div>
        <div className="lcard__meta">
          <span>{row.inversion_meta ?? 'Sin inversión'}</span>
          <span>Registrado {daysAgo(row.optin_at ?? row.created_at)}</span>
          {!mine && <span>{owner ? `De ${owner.name}` : 'Sin SDR'}</span>}
        </div>
        <div className={`lcard__summary${due ? ' text-warn' : ''}`}>
          {summaryLine(row, repName)}
          {inFollowup(row) && row.next_followup_at && <> · {due ? 'te toca ahora' : `próximo ${fmtDateTime(row.next_followup_at)}`}</>}
        </div>
        <div className="lcard__btns" onClick={(e) => e.stopPropagation()}>
          {l.phone && <a className="btn btn--ghost btn--sm" href={`tel:+${l.phone}`}>Llamar</a>}
          <WhatsAppButton phone={l.phone} small />
          <button className="btn btn--ghost btn--sm" onClick={() => setAgentsOpen(true)}>Agentes</button>
          {canClaim && <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => run(() => claimLead(row.id), () => setOpen(true))}>Tomar</button>}
        </div>
      </header>

      {open && (
        <div className="lcard__body">
          <div className="lcard__info">
            <span>📞 {l.phone ? `+${l.phone}` : '—'}</span>
            <span>✉️ {l.email ?? '—'}</span>
            <WithTip tip={T.optin}>Entró el {fmtDate(row.optin_at ?? row.created_at)}</WithTip>
            <WithTip tip={T.origin}>{row.source ?? '—'} · versión {row.variant ?? '—'}</WithTip>
            <WithTip tip={T.group}>Grupo: {row.toco_grupo ? 'sí' : 'no'}</WithTip>
            {appInv && <WithTip tip={T.application}>Aplicación: {appInv}</WithTip>}
          </div>

          <section className={`qualify${row.sdr_qualified === true ? ' is-yes' : row.sdr_qualified === false ? ' is-no' : ''}`}>
            <div className="qualify__head">
              <strong className="with-tip">¿Es realmente calificado?<InfoTip text={T.qualified} /></strong>
              <span className="muted qualify__form">
                Según el formulario: {row.califica === true ? 'califica' : row.califica === false ? 'no califica' : 'sin dato'}
                {row.inversion_meta ? ` (${row.inversion_meta})` : ''}
              </span>
            </div>
            <div className="qualify__btns">
              <button type="button" disabled={!canEdit || busy} className={`btn btn--sm qualify__btn${row.sdr_qualified === true ? ' qualify__btn--yes' : ' btn--ghost'}`}
                aria-pressed={row.sdr_qualified === true} onClick={() => qualify(true)}>✓ Sí, califica</button>
              <button type="button" disabled={!canEdit || busy} className={`btn btn--sm qualify__btn${row.sdr_qualified === false ? ' qualify__btn--no' : ' btn--ghost'}`}
                aria-pressed={row.sdr_qualified === false} onClick={() => qualify(false)}>✕ No califica</button>
              {row.sdr_qualified !== null && (
                <button type="button" disabled={!canEdit || busy} className="link link--btn" onClick={() => qualify(null)}>Todavía no sé</button>
              )}
            </div>
            {row.sdr_qualified === false && <p className="muted qualify__hint">Anotá en las notas por qué no califica: le sirve al equipo y a las métricas.</p>}
          </section>

          <section className="wk">
            <Row label="Dials" tip={T.dials}>
              <div className="dials">
                <button type="button" className="icon-btn" aria-label="Restar un dial" title="Corregir: restar un dial" disabled={!canEdit || busy || row.contact_attempts === 0} onClick={() => run(() => dial(row.id, -1))}>−</button>
                <strong>{row.contact_attempts}</strong>
                <button type="button" className="btn btn--ghost btn--sm dials__btn dials__btn--ok" disabled={!canEdit || busy} onClick={() => run(() => dial(row.id, 1, 'atendio'))}>+ Atendió</button>
                <button type="button" className="btn btn--ghost btn--sm dials__btn" disabled={!canEdit || busy} onClick={() => run(() => dial(row.id, 1, 'no_atendio'))}>+ No atendió</button>
              </div>
            </Row>
            <Row label="¿Contestó?" tip={T.answered}><YesNo value={row.answered} disabled={!canEdit || busy} onChange={(v) => patch({ answered: v })} /></Row>
            {row.answered && (
              <>
                <Row label="¿Conversación real?" tip={T.realConversation}><YesNo value={row.real_conversation} disabled={!canEdit || busy} onChange={(v) => patch({ real_conversation: v })} /></Row>
              </>
            )}
            {row.sdr_qualified && (
              <Row label="¿Está listo?" tip={T.readiness}>
                <div className="seg">
                  {(['listo', 'nutricion'] as const).map((k) => (
                    <button key={k} type="button" disabled={!canEdit || busy} className={`seg__opt${row.readiness === k ? ' is-on' : ''}`} onClick={() => patch({ readiness: k })}>
                      {k === 'listo' ? 'Listo para agendar' : 'Todavía no (nutrición)'}
                    </button>
                  ))}
                </div>
              </Row>
            )}
            <Row label="Pidió agentes" tip={T.askedAgents}>
              <YesNo value={row.asked_agents} disabled={!canEdit || busy} onChange={(v) => patch({ asked_agents: Boolean(v) })} />
            </Row>
            <label className="afield">
              <span className="afield__label"><WithTip tip={T.notes}>Notas (las ve el closer)</WithTip></span>
              <textarea
                className="field field--area"
                rows={2}
                value={notes}
                disabled={!canEdit}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notes !== (row.sdr_notes ?? '') && patch({ sdr_notes: notes })}
                placeholder={row.sdr_qualified === false ? '¿Por qué no califica? (no tiene marca, no invierte lo que dijo, no decide…)' : 'Contexto, objeciones, qué le interesa…'}
              />
            </label>
          </section>

          {canEdit && (
            <div className="lcard__actions">
              <span className="with-tip lcard__move">
                <select className="field field--select lcard__moveselect" value="" disabled={busy} aria-label="Mover a otra lista"
                  onChange={(e) => {
                    const to = e.target.value as typeof MOVE_TARGETS[number]['key'];
                    if (to === 'finalizados') return setPanel('finalizar');
                    if (to === 'no_cuentan') return setPanel('no_cuenta');
                    if (to === 'bolsa' && !window.confirm('¿Mover a «Por asignar»? El lead queda sin SDR.')) return;
                    run(() => moveLead(row.id, to));
                  }}>
                  <option value="">Mover a…</option>
                  {MOVE_TARGETS.filter((m) => m.key !== currentList(row)).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
                <InfoTip text={T.move} />
              </span>
              {!isFinalized(row) && !isBooked(row) && !isNoCuenta(row) && (
                <>
                  {row.sdr_qualified && row.readiness !== 'nutricion' && (
                    <>
                      <button className="btn btn--primary btn--sm" onClick={() => setPanel(panel === 'agendar' ? null : 'agendar')}>¡Lo agendé!</button>
                      <InfoTip text={T.book} />
                      {row.agendo !== false && <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => patch({ agendo: false })}>No agendó</button>}
                    </>
                  )}
                  {inFollowup(row) && <span className="with-tip"><button className="btn btn--ghost btn--sm" onClick={() => setPanel(panel === 'seguimiento' ? null : 'seguimiento')}>Seguimiento</button><InfoTip text={T.followup} /></span>}
                  <span className="with-tip"><button className="btn btn--ghost btn--sm" onClick={() => setPanel(panel === 'finalizar' ? null : 'finalizar')}>Finalizar</button><InfoTip text={T.finalize} /></span>
                </>
              )}
              {isFinalized(row) && <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => reopenLead(row.id))}>Reabrir</button>}
              {isNoCuenta(row) ? (
                <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => setNoCuenta(row.id, null))}>Vuelve a contar</button>
              ) : (
                <span className="with-tip"><button className="btn btn--ghost btn--sm" onClick={() => setPanel(panel === 'no_cuenta' ? null : 'no_cuenta')}>No cuenta</button><InfoTip text={T.noCuenta} /></span>
              )}
              {l.sdr_id && (
                <span className="with-tip">
                  <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => window.confirm('¿Liberar el lead? Vuelve a "Por asignar".') && run(() => releaseLead(row.id))}>
                    Liberar
                  </button>
                  <InfoTip text={T.release} />
                </span>
              )}
            </div>
          )}
          {!canEdit && canClaim && <p className="muted">Tomalo para trabajarlo.</p>}
          {!canEdit && !canClaim && l.sdr_id && <p className="muted">Lo trabaja {owner?.name ?? 'otro SDR'}.</p>}

          {panel === 'agendar' && (
            <div className="lcard__panel lcard__panel--col">
              <CallScheduler closers={closers} busy={busy} onSubmit={(cid, iso) => run(() => scheduleCall(row.id, cid, iso, ''), () => setPanel(null))} />
            </div>
          )}

          {panel === 'seguimiento' && (
            <div className="lcard__panel lcard__panel--col">
              <span className="muted">{followupWhy(row)} · seguimiento {Math.min(row.followup_step + 1, CADENCE_STEPS[row.followup_cadence ?? 'normal'])} de {CADENCE_STEPS[row.followup_cadence ?? 'normal']}{row.next_followup_at ? ` · próximo ${fmtDateTime(row.next_followup_at)}` : ''}</span>
              <div className="cadences">
                {CADENCES.map((c) => (
                  <button key={c.key} type="button" title={c.detail} disabled={busy} className={`cadence${row.followup_cadence === c.key ? ' is-on' : ''}`}
                    onClick={() => (c.key !== 'ninguna' || window.confirm('Sin seguimiento: el lead pasa a Finalizados. ¿Seguro?')) && patch({ followup_cadence: c.key })}>
                    <b>{c.title}</b>
                    <small>{c.sub}</small>
                  </button>
                ))}
              </div>
              <textarea className="field field--area" rows={2} value={fuNote} onChange={(e) => setFuNote(e.target.value)} placeholder="Qué le mandaste o qué te dijo" />
              <div className="filters" style={{ marginBottom: 0 }}>
                <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => followupDone(row.id, false, fuNote), () => setFuNote(''))}>Hice el seguimiento · no respondió</button>
                <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => run(() => followupDone(row.id, true, fuNote), () => setFuNote(''))}>Respondió</button>
              </div>
            </div>
          )}

          {panel === 'finalizar' && (
            <div className="lcard__panel">
              {FINALIZE_REASONS.map((r) => (
                <button key={r} className="chip chip--sm" disabled={busy} onClick={() => run(() => finalizeLead(row.id, r), () => setPanel(null))}>{r}</button>
              ))}
            </div>
          )}

          {panel === 'no_cuenta' && (
            <div className="lcard__panel">
              {NO_CUENTA_REASONS.map((r) => (
                <button key={r} className="chip chip--sm" disabled={busy} onClick={() => run(() => setNoCuenta(row.id, r), () => setPanel(null))}>{r}</button>
              ))}
            </div>
          )}

          {error && <p className="state--error">{error}</p>}

          <span className="with-tip">
            <button type="button" className="link link--btn" onClick={toggleEvents}>
              {showEvents ? '▾' : '▸'} Recorrido{events ? ` (${events.length})` : ''}
            </button>
            <InfoTip text={T.timeline} />
          </span>
          {showEvents && (events ? <Timeline events={events} /> : <p className="muted">Cargando…</p>)}
        </div>
      )}

      {agentsOpen && (
        <AgentsModal row={row} agents={ctx.agents.filter((a) => a.active)} onClose={() => setAgentsOpen(false)} onSent={() => { setAgentsOpen(false); ctx.refresh(row.id); }} />
      )}
    </article>
  );
}
