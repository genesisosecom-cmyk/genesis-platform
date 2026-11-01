import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../lib/useAsync';
import { fmtDateTime, fmtMoney } from '../lib/format';
import { Field, State } from '../admin/ui';
import { ArrowLeft } from '../components/Icons';
import { MAX_FILE_MB, tooBig } from '../content/files';
import {
  fetchCall,
  fetchLeadEvents,
  fetchSalesReps,
  isoToLocal,
  localToIso,
  reassignCall,
  recordCallResult,
  rescheduleCall,
  uploadReceipt,
  type CallRow,
} from './api';
import type { SalesRep } from '../lib/types';
import { ApplicationAnswers, CallStatePill, LeadActions, LeadSummary, ReceiptLink, StatusPill, Timeline, WhatsAppButton } from './components';

async function load(id: string) {
  const call = await fetchCall(id);
  const [events, reps] = await Promise.all([fetchLeadEvents(call.lead_launch.lead_id), fetchSalesReps()]);
  return { call, events, reps };
}

export default function CallPage() {
  const { callId = '' } = useParams();
  const { isAdmin, rep } = useAuth();
  const { data, loading, error, reload } = useAsync(() => load(callId), [callId]);

  return (
    <div className="fade-in">
      <Link to={isAdmin && !rep?.closer_status ? '/admin/leads' : '/closer'} className="back">
        <ArrowLeft width={16} height={16} /> {isAdmin && !rep?.closer_status ? 'Leads' : 'Mis llamadas'}
      </Link>
      <State loading={loading} error={error}>
        {data && (() => {
          const { call, events, reps } = data;
          const row = call.lead_launch;
          const closerName = reps.find((r) => r.id === call.closer_id)?.name ?? '—';
          const canResult = call.status === 'agendada' && (isAdmin || (rep && call.closer_id === rep.id));
          return (
            <>
              <div className="detail-head">
                <div>
                  <span className="eyebrow">Llamada · {closerName}</span>
                  <h2 className="page__title page__title--sm">{row.lead.full_name || row.lead.email}</h2>
                  <div className="detail-meta">
                    <CallStatePill call={call} />
                    <span>{fmtDateTime(call.scheduled_at)}</span>
                    <span>Agendó: {call.scheduled_by_name ?? '—'}</span>
                    <StatusPill status={row.post_class_status} />
                  </div>
                </div>
                <WhatsAppButton phone={row.lead.phone} />
              </div>

              <div className="two-col two-col--top">
                <div className="stack">
                  <section className="glass panel">
                    <h2 className="panel__title">Nota del SDR</h2>
                    <p className="notes">{call.sdr_note || 'Sin nota.'}</p>
                  </section>
                  {canResult ? (
                    <ResultForm call={call} onDone={reload} />
                  ) : (
                    <CallResult call={call} isAdmin={isAdmin} />
                  )}
                  {call.status === 'agendada' && (isAdmin || (rep && call.closer_id === rep.id)) && (
                    <Reschedule call={call} reps={reps} isAdmin={isAdmin} onDone={reload} />
                  )}
                  <section className="glass panel">
                    <h2 className="panel__title">Seguimiento del lead</h2>
                    <LeadActions row={row} reps={reps} mode={isAdmin ? 'admin' : 'closer'} onDone={reload} />
                  </section>
                  <section className="glass panel">
                    <h2 className="panel__title">Historial</h2>
                    <Timeline events={events} />
                  </section>
                </div>
                <div className="stack">
                  <section className="glass panel">
                    <h2 className="panel__title">Datos del lead</h2>
                    <LeadSummary row={row} reps={reps} />
                  </section>
                  <section className="glass panel">
                    <h2 className="panel__title">Aplicación</h2>
                    <ApplicationAnswers row={row} />
                  </section>
                </div>
              </div>
            </>
          );
        })()}
      </State>
    </div>
  );
}

function CallResult({ call, isAdmin }: { call: CallRow; isAdmin: boolean }) {
  if (call.status === 'cancelada') {
    return (
      <section className="glass panel">
        <h2 className="panel__title">Resultado</h2>
        <p className="muted">Llamada cancelada (se reagendó o la reasignaron).</p>
      </section>
    );
  }
  return (
    <section className="glass panel">
      <h2 className="panel__title">Resultado</h2>
      {call.result === 'cerro' ? (
        <dl className="kv">
          <div className="kv__row"><dt>Resultado</dt><dd>Cerró</dd></div>
          <div className="kv__row"><dt>Monto del programa</dt><dd>{fmtMoney(Number(call.amount_total), call.currency)}</dd></div>
          <div className="kv__row"><dt>Cobrado</dt><dd>{fmtMoney(Number(call.amount_collected), call.currency)}</dd></div>
          <div className="kv__row"><dt>Medio de pago</dt><dd>{call.payment_method ?? '—'}</dd></div>
          <div className="kv__row"><dt>Comprobante</dt><dd>{call.receipt_path ? <ReceiptLink path={call.receipt_path} /> : '—'}</dd></div>
          {isAdmin && call.client_id && (
            <div className="kv__row"><dt>Cliente</dt><dd><Link className="link" to={`/admin/clientes/${call.client_id}`}>Ver en Clientes y pagos</Link></dd></div>
          )}
        </dl>
      ) : (
        <p>No se cerró.</p>
      )}
      {call.result_note && <p className="notes">{call.result_note}</p>}
      <p className="muted">Cargado el {fmtDateTime(call.closed_at)}</p>
    </section>
  );
}

function ResultForm({ call, onDone }: { call: CallRow; onDone: () => void }) {
  const [result, setResult] = useState<'cerro' | 'no_cerro' | null>(null);
  const [total, setTotal] = useState('');
  const [collected, setCollected] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!result) return;
    if (result === 'cerro' && !(Number(total) > 0)) return setError('Cargá el monto del programa.');
    if (file && tooBig(file)) return setError(`El comprobante supera los ${MAX_FILE_MB} MB.`);
    setBusy(true);
    setError(null);
    try {
      const receiptPath = result === 'cerro' && file ? await uploadReceipt(call.id, file) : null;
      await recordCallResult(call.id, {
        result,
        note,
        amountTotal: result === 'cerro' ? Number(total) : undefined,
        amountCollected: result === 'cerro' ? Number(collected || 0) : undefined,
        currency,
        paymentMethod: method,
        receiptPath,
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <section className="glass panel">
      <h2 className="panel__title">Resultado de la llamada</h2>
      <div className="chips">
        <button type="button" className={`chip${result === 'cerro' ? ' is-active' : ''}`} onClick={() => setResult('cerro')}>Cerró · Cliente</button>
        <button type="button" className={`chip${result === 'no_cerro' ? ' is-active' : ''}`} onClick={() => setResult('no_cerro')}>No se cerró</button>
      </div>
      {result && (
        <form className="aform" onSubmit={submit}>
          {result === 'cerro' && (
            <>
              <Field label="Monto del programa">
                <input className="field" type="number" min="0" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} required />
              </Field>
              <Field label="Cobrado en la llamada">
                <input className="field" type="number" min="0" step="0.01" value={collected} onChange={(e) => setCollected(e.target.value)} placeholder="0" />
              </Field>
              <Field label="Moneda">
                <input className="field" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
              </Field>
              <Field label="Medio de pago">
                <input className="field" list="payment-methods" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Transferencia, tarjeta, cripto…" />
                <datalist id="payment-methods">
                  {['Transferencia', 'Tarjeta', 'Stripe', 'PayPal', 'Cripto', 'Efectivo'].map((m) => <option key={m} value={m} />)}
                </datalist>
              </Field>
              <Field label="Comprobante" full>
                <input className="field" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </Field>
            </>
          )}
          <Field label="Nota" full>
            <textarea className="field field--area" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={result === 'cerro' ? 'Plan de pagos, acuerdos…' : 'Por qué no cerró'} />
          </Field>
          {result === 'cerro' && (
            <p className="muted afield--full">
              Se crea el cliente en Clientes y pagos (o se usa el que ya existe con el mismo email o teléfono) y lo cobrado se registra como pago. El lead pasa a "Cliente · falta onboarding".
            </p>
          )}
          {error && <p className="login__error afield--full">{error}</p>}
          <div className="aform__actions afield--full">
            <button className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar resultado'}</button>
          </div>
        </form>
      )}
    </section>
  );
}

function Reschedule({ call, reps, isAdmin, onDone }: { call: CallRow; reps: SalesRep[]; isAdmin: boolean; onDone: () => void }) {
  const [at, setAt] = useState(isoToLocal(call.scheduled_at));
  const [closerId, setCloserId] = useState(call.closer_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closers = reps.filter((r) => r.closer_status === 'activo');

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass panel">
      <h2 className="panel__title">Reprogramar</h2>
      <div className="aform">
        <Field label="Nueva fecha y hora">
          <input className="field" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
        <div className="aform__actions aform__actions--start" style={{ alignSelf: 'end' }}>
          <button className="btn btn--ghost" disabled={busy || at === isoToLocal(call.scheduled_at) || !at} onClick={() => run(() => rescheduleCall(call.id, localToIso(at)!))}>
            Reprogramar
          </button>
        </div>
        {isAdmin && (
          <>
            <Field label="Closer">
              <select className="field field--select" value={closerId} onChange={(e) => setCloserId(e.target.value)}>
                {closers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <div className="aform__actions aform__actions--start" style={{ alignSelf: 'end' }}>
              <button className="btn btn--ghost" disabled={busy || !closerId || closerId === call.closer_id} onClick={() => run(() => reassignCall(call.id, closerId))}>
                Reasignar closer
              </button>
            </div>
          </>
        )}
        {error && <p className="state--error afield--full">{error}</p>}
      </div>
    </section>
  );
}
