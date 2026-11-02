import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Pill } from '../admin/ui';
import { fmtDateTime, fmtMoney } from '../lib/format';
import type { LeadEvent, PostClassStatus, SalesCall, SalesRep } from '../lib/types';
import { CLOSED_STATUSES, openReceipt, waLink, type LeadRow } from './api';

export function StatusPill({ status }: { status: PostClassStatus | null }) {
  if (!status) return <Pill tone="muted">Sin estado</Pill>;
  const tone = status === 'Cliente' || status === 'Cliente · falta onboarding' ? 'ok' : status === 'Agendado' ? 'accent' : status === 'No se cerró' ? 'muted' : 'warn';
  return <Pill tone={tone}>{status}</Pill>;
}

export function WhatsAppButton({ phone, small }: { phone: string | null; small?: boolean }) {
  const href = waLink(phone);
  if (!href) return <span className="muted">Sin teléfono</span>;
  return (
    <a className={`btn btn--wa${small ? ' btn--sm' : ''}`} href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
      WhatsApp
    </a>
  );
}

const repName = (reps: SalesRep[], id: string | null) => (id ? reps.find((r) => r.id === id)?.name ?? '—' : null);

/** Datos del lead: contacto, inversión, landing, grupo, aplicación, SDR y closer. */
export function LeadSummary({ row, reps }: { row: LeadRow; reps: SalesRep[] }) {
  const l = row.lead;
  const items: [string, ReactNode][] = [
    ['Email', l.email ?? '—'],
    ['Teléfono', l.phone ? `+${l.phone}` : '—'],
    ['Inversión en Meta', row.inversion_meta ?? '—'],
    ['Califica', row.califica === null ? '—' : row.califica ? <Pill tone="ok">Sí · 100 USD/día o más</Pill> : <Pill tone="muted">No</Pill>],
    ['Versión de landing', row.variant ?? '—'],
    ['Fuente', row.source ?? '—'],
    ['Optin', fmtDateTime(row.optin_at)],
    ['Grupo de WhatsApp', row.toco_grupo ? <Pill tone="accent">Entró · {fmtDateTime(row.toco_grupo_at)}</Pill> : 'No'],
    ['Aplicó', row.route === 'aplicado' ? <Pill tone="ok">{fmtDateTime(row.applied_at)}</Pill> : row.route === 'rechazado' ? <Pill tone="muted">Próximo ciclo</Pill> : 'No'],
    ['SDR', repName(reps, l.sdr_id) ?? 'Sin asignar'],
    ['Closer', repName(reps, row.closer_id) ?? '—'],
    ['Intentos de contacto', row.contact_attempts],
  ];
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k} className="kv__row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const APPLICATION_FIELDS: [string, string][] = [
  ['objetivo', 'Objetivo'],
  ['freno', 'Freno'],
  ['hace_cuanto', 'Hace cuánto'],
  ['conoce_manu', 'Conoce a Manu'],
  ['por_que_ahora', 'Por qué ahora'],
  ['ciclo', 'Ciclo'],
  ['facturacion', 'Facturación'],
  ['inversion', 'Inversión'],
];

export function ApplicationAnswers({ row }: { row: LeadRow }) {
  if (!row.application) return <p className="muted">Todavía no aplicó.</p>;
  const a = row.application as Record<string, unknown>;
  return (
    <dl className="answers">
      {APPLICATION_FIELDS.filter(([k]) => a[k]).map(([k, label]) => (
        <div key={k} className="answers__item">
          <dt>{label}</dt>
          <dd>{String(a[k])}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Timeline({ events }: { events: LeadEvent[] }) {
  if (!events.length) return <p className="muted">Sin eventos.</p>;
  return (
    <ol className="timeline">
      {events.map((e) => (
        <li key={e.id} className={`timeline__item timeline__item--${e.kind}`}>
          <div className="timeline__meta">
            {fmtDateTime(e.created_at)} · {e.created_by_name ?? 'Automático'}
          </div>
          <div className="timeline__text">{e.summary}</div>
        </li>
      ))}
    </ol>
  );
}

export function CallsList({ calls, reps, linkCalls }: { calls: SalesCall[]; reps: SalesRep[]; linkCalls: boolean }) {
  if (!calls.length) return <p className="muted">Sin llamadas agendadas.</p>;
  return (
    <ul className="mini-list">
      {calls.map((c) => {
        const body = (
          <>
            <span>
              <strong>{fmtDateTime(c.scheduled_at)}</strong>
              <span className="muted"> · {repName(reps, c.closer_id) ?? '—'}</span>
            </span>
            <CallStatePill call={c} />
          </>
        );
        return (
          <li key={c.id}>
            {linkCalls ? <Link to={`/closer/${c.id}`} className="mini-list__item">{body}</Link> : <div className="mini-list__item">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function CallStatePill({ call }: { call: SalesCall }) {
  if (call.status === 'cancelada') return <Pill tone="muted">Cancelada</Pill>;
  if (call.result === 'cerro') return <Pill tone="ok">Cerró · {fmtMoney(Number(call.amount_total), call.currency)}</Pill>;
  if (call.result === 'no_cerro') return <Pill tone="muted">No se cerró</Pill>;
  if (new Date(call.scheduled_at) < new Date()) return <Pill tone="warn">Sin resultado</Pill>;
  return <Pill tone="accent">Agendada</Pill>;
}

export function ReceiptLink({ path }: { path: string | null }) {
  if (!path) return null;
  return (
    <button type="button" className="link link--btn" onClick={() => openReceipt(path)}>
      Ver comprobante
    </button>
  );
}

export const isClosed = (r: LeadRow) => CLOSED_STATUSES.includes(r.post_class_status);
