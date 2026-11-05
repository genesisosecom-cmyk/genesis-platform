import { useState } from 'react';
import { Field, Pill } from '../admin/ui';
import { fmtDate, fmtDateTime, fmtMoney, todayISO, addMonthsISO } from '../lib/format';
import { MAX_FILE_MB, tooBig } from '../content/files';
import type { Payment, SalesRep } from '../lib/types';
import {
  addSalePayment,
  isoToLocal,
  localToIso,
  markAttendance,
  openReceipt,
  recordCallResult,
  rescheduleCall,
  setInstallments,
  setStatus,
  uploadReceipt,
  type CallRow,
  type Installment,
} from './api';
import { callState } from './model';
import { CallPill } from './widgets';
import { WhatsAppButton } from './components';

const METHODS = ['Stripe', 'Mercado Pago', 'Transferencia', 'PayPal', 'Cripto', 'Efectivo'];

interface PayRow {
  amount: string;
  method: string;
  paid_at: string;
  file: File | null;
}
interface QuotaRow {
  amount: string;
  due_date: string;
}

const emptyPay = (): PayRow => ({ amount: '', method: 'Stripe', paid_at: todayISO(), file: null });

/** Lo que falta en cuotas iguales cada 30 días desde el último pago. */
function splitQuotas(rest: number, count: number, from: string): QuotaRow[] {
  if (rest <= 0 || count <= 0) return [];
  const each = Math.floor((rest / count) * 100) / 100;
  return Array.from({ length: count }, (_, i) => ({
    amount: String(i === count - 1 ? Math.round((rest - each * (count - 1)) * 100) / 100 : each),
    due_date: addMonthsISO(from, i + 1),
  }));
}

/** Ficha de la call: asistencia, resultado y cobro. */
export default function CallCard({
  call,
  reps,
  payments,
  canEdit,
  onChanged,
}: {
  call: CallRow;
  reps: SalesRep[];
  payments: Payment[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const r = call.lead_launch;
  const st = callState(call);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<null | 'reagendar' | 'cerro' | 'seguimiento' | 'no_cerro' | 'pago' | 'cuotas'>(null);
  const [at, setAt] = useState(isoToLocal(call.scheduled_at));
  const [note, setNote] = useState('');
  const [fuAt, setFuAt] = useState('');
  // Venta
  const [program, setProgram] = useState('');
  const [total, setTotal] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [pays, setPays] = useState<PayRow[]>([emptyPay()]);
  const [quotaCount, setQuotaCount] = useState(2);
  const [quotas, setQuotas] = useState<QuotaRow[] | null>(null);
  // Pago nuevo / cuotas de una venta hecha
  const [pay, setPay] = useState<PayRow>(emptyPay());
  const [editQuotas, setEditQuotas] = useState<QuotaRow[]>([]);

  const sdr = reps.find((x) => x.id === call.sdr_id)?.name;
  const closer = reps.find((x) => x.id === call.closer_id)?.name;
  const paid = payments.filter((p) => p.paid_at);
  const due = payments.filter((p) => !p.paid_at);
  const paidSum = paid.reduce((s, p) => s + Number(p.amount), 0);
  const dueSum = due.reduce((s, p) => s + Number(p.amount), 0);

  const saleCollected = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const lastPayDate = pays.map((p) => p.paid_at).filter(Boolean).sort().pop() ?? todayISO();
  const autoQuotas = splitQuotas((Number(total) || 0) - saleCollected, quotaCount, lastPayDate);
  const shownQuotas = quotas ?? autoQuotas;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMode(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveSale = () =>
    run(async () => {
      if (!(Number(total) > 0)) throw new Error('Cargá el monto de la venta.');
      for (const p of pays) if (p.file && tooBig(p.file)) throw new Error(`Un comprobante supera los ${MAX_FILE_MB} MB.`);
      const uploaded = await Promise.all(
        pays.filter((p) => Number(p.amount) > 0).map(async (p) => ({
          amount: Number(p.amount),
          method: p.method,
          paid_at: p.paid_at,
          receipt_path: p.file ? await uploadReceipt(call.id, p.file) : null,
        })),
      );
      await recordCallResult(call.id, {
        result: 'cerro',
        note,
        program,
        amountTotal: Number(total),
        currency,
        payments: uploaded,
        installments: shownQuotas.filter((q) => Number(q.amount) > 0).map((q) => ({ amount: Number(q.amount), due_date: q.due_date })),
      });
    });

  const savePayment = () =>
    run(async () => {
      if (!(Number(pay.amount) > 0)) throw new Error('Cargá el monto del pago.');
      if (pay.file && tooBig(pay.file)) throw new Error(`El comprobante supera los ${MAX_FILE_MB} MB.`);
      const receipt = pay.file ? await uploadReceipt(call.id, pay.file) : null;
      await addSalePayment(call.id, { amount: Number(pay.amount), method: pay.method, paid_at: pay.paid_at, receipt_path: receipt });
      setPay(emptyPay());
    });

  const payFields = (p: PayRow, set: (p: PayRow) => void, remove?: () => void) => (
    <div className="pay-row">
      <input className="field" type="number" min="0" step="0.01" placeholder="Monto" value={p.amount} onChange={(e) => set({ ...p, amount: e.target.value })} />
      <input className="field" list="pay-methods" value={p.method} onChange={(e) => set({ ...p, method: e.target.value })} placeholder="Medio" />
      <input className="field" type="date" value={p.paid_at} onChange={(e) => set({ ...p, paid_at: e.target.value })} />
      <input className="field" type="file" accept="image/*,application/pdf" onChange={(e) => set({ ...p, file: e.target.files?.[0] ?? null })} aria-label="Comprobante" />
      {remove && <button type="button" className="icon-btn" onClick={remove} aria-label="Quitar pago">✕</button>}
    </div>
  );

  return (
    <div className="callcard">
      <div className="detail-head" style={{ marginBottom: 12 }}>
        <div>
          <span className="eyebrow">Call · {closer ?? '—'}{sdr ? ` · agendó ${sdr}` : ''}</span>
          <h3 className="page__title page__title--sm">{r.lead.full_name || r.lead.email}</h3>
          <div className="detail-meta">
            <CallPill call={call} />
            <span>{fmtDateTime(call.scheduled_at)}</span>
            <span>{r.inversion_meta ?? '—'}</span>
            {(r.application as { inversion?: string } | null)?.inversion && <span>Aplicación: {(r.application as { inversion?: string }).inversion}</span>}
          </div>
        </div>
        <div className="filters" style={{ marginBottom: 0 }}>
          {r.lead.phone && <a className="btn btn--ghost btn--sm" href={`tel:+${r.lead.phone}`}>Llamar</a>}
          <WhatsAppButton phone={r.lead.phone} small />
        </div>
      </div>

      {(call.sdr_note || r.sdr_notes) && (
        <section className="callcard__notes">
          <span className="afield__label">Notas del SDR</span>
          <p className="notes">{[call.sdr_note, r.sdr_notes && r.sdr_notes !== call.sdr_note ? r.sdr_notes : null].filter(Boolean).join('\n\n')}</p>
        </section>
      )}

      {canEdit && (st === 'pendiente' || st === 'sinmarcar') && (
        <div className="lcard__actions">
          <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => run(() => markAttendance(call.id, 'se_presento'))}>Se presentó</button>
          <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => markAttendance(call.id, 'no_show'))}>No-show</button>
          <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => markAttendance(call.id, 'cancelo'))}>Canceló</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setMode('reagendar')}>Reagendó</button>
        </div>
      )}

      {canEdit && (st === 'se_presento' || st === 'seguimiento') && (
        <div className="lcard__actions">
          <button className={`btn btn--sm ${mode === 'cerro' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setMode('cerro')}>Cerró</button>
          <button className={`btn btn--sm ${mode === 'seguimiento' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setMode('seguimiento')}>Seguimiento</button>
          <button className={`btn btn--sm ${mode === 'no_cerro' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setMode('no_cerro')}>No cerró</button>
          {st === 'seguimiento' && <button className="btn btn--ghost btn--sm" onClick={() => setMode('reagendar')}>Agendar otra call</button>}
        </div>
      )}

      {canEdit && (st === 'no_show' || st === 'cancelo') && (
        <div className="lcard__actions">
          <span className="muted">Volvió al SDR como "calificó y no agendó".</span>
          <button className="btn btn--ghost btn--sm" onClick={() => setMode('reagendar')}>Reagendar</button>
        </div>
      )}

      {st === 'seguimiento' && call.closer_followup_at && <p className="muted">Follow-up: {fmtDateTime(call.closer_followup_at)}{call.result_note ? ` · ${call.result_note}` : ''}</p>}

      {mode === 'reagendar' && (
        <div className="lcard__panel">
          <input className="field" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          <button className="btn btn--primary btn--sm" disabled={busy || !at} onClick={() => run(() => rescheduleCall(call.id, localToIso(at)!))}>Guardar nueva fecha</button>
        </div>
      )}

      {mode === 'seguimiento' && (
        <div className="aform">
          <Field label="Próximo contacto"><input className="field" type="datetime-local" value={fuAt} onChange={(e) => setFuAt(e.target.value)} /></Field>
          <Field label="Nota"><input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Qué quedó pendiente" /></Field>
          <div className="aform__actions afield--full">
            <button className="btn btn--primary" disabled={busy || !fuAt} onClick={() => run(() => recordCallResult(call.id, { result: 'seguimiento', note, followupAt: localToIso(fuAt) }))}>Guardar seguimiento</button>
          </div>
        </div>
      )}

      {mode === 'no_cerro' && (
        <div className="aform">
          <Field label="Por qué no cerró" full><textarea className="field field--area" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="aform__actions afield--full">
            <button className="btn btn--primary" disabled={busy} onClick={() => run(() => recordCallResult(call.id, { result: 'no_cerro', note }))}>Guardar</button>
          </div>
        </div>
      )}

      {mode === 'cerro' && (
        <div className="aform">
          <Field label="Programa"><input className="field" list="programs-crm" value={program} onChange={(e) => setProgram(e.target.value)} placeholder="Genesis OS, Genesis OG…" /></Field>
          <datalist id="programs-crm">{['Genesis OS', 'Genesis OG', 'Genesis Lite'].map((p) => <option key={p} value={p} />)}</datalist>
          <Field label="Monto de la venta"><input className="field" type="number" min="0" step="0.01" value={total} onChange={(e) => { setTotal(e.target.value); setQuotas(null); }} /></Field>
          <Field label="Moneda"><input className="field" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></Field>
          <div className="afield--full">
            <span className="afield__label">Pagos de hoy (se puede dividir en varios medios) · comprobante opcional</span>
            <datalist id="pay-methods">{METHODS.map((m) => <option key={m} value={m} />)}</datalist>
            {pays.map((p, i) => (
              <div key={i}>
                {payFields(p, (np) => { setPays((ps) => ps.map((x, j) => (j === i ? np : x))); setQuotas(null); }, pays.length > 1 ? () => setPays((ps) => ps.filter((_, j) => j !== i)) : undefined)}
              </div>
            ))}
            <button type="button" className="link link--btn" onClick={() => setPays((ps) => [...ps, { ...emptyPay(), method: 'Mercado Pago' }])}>+ Otro medio de pago</button>
          </div>
          <div className="afield--full">
            <span className="afield__label">
              Falta {fmtMoney(Math.max(0, (Number(total) || 0) - saleCollected), currency)} · cuotas cada 30 días
            </span>
            <div className="filters">
              <input className="field field--num" type="number" min="0" max="24" value={quotaCount} onChange={(e) => { setQuotaCount(Number(e.target.value)); setQuotas(null); }} aria-label="Cantidad de cuotas" />
              <span className="muted">cuotas</span>
              {quotas && <button type="button" className="link link--btn" onClick={() => setQuotas(null)}>Repartir de nuevo</button>}
            </div>
            {shownQuotas.map((q, i) => (
              <div key={i} className="pay-row">
                <input className="field" type="number" min="0" step="0.01" value={q.amount} onChange={(e) => setQuotas(shownQuotas.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                <input className="field" type="date" value={q.due_date} onChange={(e) => setQuotas(shownQuotas.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))} />
              </div>
            ))}
          </div>
          <Field label="Nota" full><input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Acuerdos, plan de pagos…" /></Field>
          <p className="muted afield--full">Se crea el cliente en Clientes y pagos (o se usa el que ya existe con el mismo mail o teléfono) con los pagos y las cuotas.</p>
          <div className="aform__actions afield--full">
            <button className="btn btn--primary" disabled={busy} onClick={saveSale}>{busy ? 'Guardando…' : 'Guardar venta'}</button>
          </div>
        </div>
      )}

      {st === 'cerro' && (
        <section className="callcard__sale">
          <div className="kpis kpis--3">
            <div className="glass kpi"><span className="eyebrow">Venta</span><span className="kpi__value">{fmtMoney(Number(call.amount_total), call.currency)}</span><span className="muted kpi__hint">{call.program ?? '—'}</span></div>
            <div className="glass kpi kpi--ok"><span className="eyebrow">Cobrado</span><span className="kpi__value">{fmtMoney(paidSum, call.currency)}</span></div>
            <div className="glass kpi"><span className="eyebrow">Por cobrar</span><span className="kpi__value">{fmtMoney(dueSum, call.currency)}</span><span className="muted kpi__hint">{due.length} cuota(s)</span></div>
          </div>
          <ul className="mini-list">
            {payments.map((p) => (
              <li key={p.id}>
                <div className="mini-list__item">
                  <span>{fmtMoney(Number(p.amount), p.currency)} · {p.paid_at ? `${p.method ?? '—'} · ${fmtDate(p.paid_at)}` : `cuota · vence ${fmtDate(p.due_date)}`}</span>
                  <span>{p.paid_at ? (p.receipt_path ? <button className="link link--btn" onClick={() => openReceipt(p.receipt_path!)}>Comprobante</button> : <Pill tone="warn">Sin comprobante</Pill>) : <Pill tone="muted">Pendiente</Pill>}</span>
                </div>
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="lcard__actions">
              <button className="btn btn--ghost btn--sm" onClick={() => setMode(mode === 'pago' ? null : 'pago')}>Registrar pago</button>
              <button className="btn btn--ghost btn--sm" onClick={() => { setEditQuotas(due.map((d) => ({ amount: String(d.amount), due_date: d.due_date ?? todayISO() }))); setMode(mode === 'cuotas' ? null : 'cuotas'); }}>Editar cuotas</button>
              {r.post_class_status === 'Cliente · falta onboarding' && (
                <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => window.confirm('¿Ya hizo el onboarding?') && run(() => setStatus(r.id, 'Cliente'))}>Onboarding hecho</button>
              )}
            </div>
          )}
          {mode === 'pago' && (
            <div className="afield--full">
              <datalist id="pay-methods">{METHODS.map((m) => <option key={m} value={m} />)}</datalist>
              {payFields(pay, setPay)}
              <p className="muted">Se descuenta de las cuotas pendientes en orden.</p>
              <button className="btn btn--primary btn--sm" disabled={busy} onClick={savePayment}>Guardar pago</button>
            </div>
          )}
          {mode === 'cuotas' && (
            <div className="afield--full">
              {editQuotas.map((q, i) => (
                <div key={i} className="pay-row">
                  <input className="field" type="number" min="0" step="0.01" value={q.amount} onChange={(e) => setEditQuotas(editQuotas.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                  <input className="field" type="date" value={q.due_date} onChange={(e) => setEditQuotas(editQuotas.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))} />
                  <button type="button" className="icon-btn" onClick={() => setEditQuotas(editQuotas.filter((_, j) => j !== i))} aria-label="Quitar cuota">✕</button>
                </div>
              ))}
              <div className="filters">
                <button type="button" className="link link--btn" onClick={() => setEditQuotas([...editQuotas, { amount: '', due_date: addMonthsISO(editQuotas[editQuotas.length - 1]?.due_date ?? todayISO(), 1) }])}>+ Cuota</button>
                <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => run(() => setInstallments(call.id, editQuotas.map((q): Installment => ({ amount: Number(q.amount), due_date: q.due_date }))))}>Guardar cuotas</button>
              </div>
            </div>
          )}
        </section>
      )}

      {st === 'no_cerro' && <p className="muted">No cerró{call.result_note ? `: ${call.result_note}` : ''}.</p>}
      {error && <p className="state--error">{error}</p>}
    </div>
  );
}
