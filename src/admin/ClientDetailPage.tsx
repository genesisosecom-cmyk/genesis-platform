import { useLiveReload } from '../lib/realtime';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, unwrap } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { clientBalance, fetchForms, fetchPayments, paymentStatus } from './api';
import { Field, Kpi, Modal, Pill, State } from './ui';
import ClientFormModal, { equalPlan, STATUS_LABELS, type PlanRow } from './ClientForm';
import { PROGRAMS } from '../data/schedule';
import ProgressBar from '../components/ProgressBar';
import { summarizeProgress } from '../progress/ProgressContext';
import { addMonthsISO, fmtDate, fmtDateTime, fmtMoney, todayISO } from '../lib/format';
import type { Client, FormResponse, LessonProgressRow, Payment, Profile } from '../lib/types';
import { ArrowLeft } from '../components/Icons';
import { discordVariants } from '../lib/discord';
import { useContent } from '../content/ContentContext';
import ClientCommissions from './finance/ClientCommissions';

const escape = (v: string) => v.replace(/[\\%_]/g, '\\$&');

async function load(id: string) {
  const client = unwrap(await supabase.from('clients').select('*').eq('id', id).single()) as Client;
  const [payments, forms] = await Promise.all([fetchPayments(id), fetchForms()]);
  let profile: Profile | null = null;
  let progress: LessonProgressRow[] = [];
  let responses: FormResponse[] = [];
  if (client.profile_id) {
    profile = unwrap(await supabase.from('profiles').select('*').eq('id', client.profile_id).maybeSingle()) as Profile | null;
    progress = unwrap(await supabase.from('lesson_progress').select('*').eq('user_id', client.profile_id)) as LessonProgressRow[];
  }
  // Respuestas del cliente: coinciden por email o por canal de Discord.
  const queries = [
    ...(client.email ? [supabase.from('form_responses').select('*').ilike('respondent_email', escape(client.email))] : []),
    ...discordVariants(client.discord_channel).map((v) => supabase.from('form_responses').select('*').ilike('discord_channel', v)),
  ];
  const found = (await Promise.all(queries)).flatMap((res) => unwrap(res) as FormResponse[]);
  responses = [...new Map(found.map((r) => [r.id, r])).values()].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  return { client, payments, forms, profile, progress, responses };
}

export default function ClientDetailPage() {
  const { clientId = '' } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(() => load(clientId), [clientId]);
  useLiveReload(['clients', 'payments', 'client_team', 'form_responses'], reload, { delayMs: 1500 });
  const { modules } = useContent();
  const [editing, setEditing] = useState(false);
  const [paymentModal, setPaymentModal] = useState<Payment | 'new' | null>(null);
  const [paying, setPaying] = useState<Payment | null>(null);
  const [upselling, setUpselling] = useState(false);

  const remove = async () => {
    if (!data || !window.confirm(`¿Eliminar a ${data.client.full_name} y todos sus pagos? Esta acción no se puede deshacer.`)) return;
    await supabase.from('clients').delete().eq('id', data.client.id);
    navigate('/admin/clientes');
  };

  const unpay = async (p: Payment) => {
    await supabase.from('payments').update({ paid_at: null, method: null }).eq('id', p.id);
    reload();
  };

  const removePayment = async (p: Payment) => {
    if (!window.confirm('¿Eliminar este pago/cuota?')) return;
    await supabase.from('payments').delete().eq('id', p.id);
    reload();
  };

  return (
    <>
      <Link to="/admin/clientes" className="back"><ArrowLeft width={16} height={16} /> Clientes</Link>
      <State loading={loading} error={error}>
        {data && (() => {
          const { client: c, payments, profile, progress, responses, forms } = data;
          const b = clientBalance(c, payments);
          const summary = profile ? summarizeProgress(progress, modules) : null;
          const today = todayISO();
          return (
            <>
              <div className="detail-head">
                <div>
                  <span className="eyebrow">{c.program || 'Cliente'}</span>
                  <h2 className="page__title page__title--sm">{c.full_name}</h2>
                  <div className="detail-meta">
                    <Pill tone={c.status === 'activo' ? 'ok' : 'muted'}>{STATUS_LABELS[c.status]}</Pill>
                    {c.email && <span>{c.email}</span>}
                    {c.phone && <a className="link" href={`https://wa.me/${c.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{c.phone}</a>}
                    {c.discord_channel && <span className="discord">Discord: {c.discord_channel}</span>}
                    {c.company && <span>{c.company}</span>}
                    <span>{fmtDate(c.start_date)} → {fmtDate(c.end_date)}</span>
                  </div>
                </div>
                <div className="aform__actions">
                  <button className="btn btn--ghost" onClick={() => setEditing(true)}>Editar</button>
                  <button className="btn btn--ghost" onClick={remove}>Eliminar</button>
                </div>
              </div>

              <div className="kpis kpis--4">
                <Kpi label="Total contrato" value={fmtMoney(b.total, c.currency)} hint={`${c.installments_count} cuota${c.installments_count > 1 ? 's' : ''}${Number(c.upsell_amount) > 0 ? ` · upsell ${fmtMoney(Number(c.upsell_amount), c.currency)}` : ''}`} />
                <Kpi label="Pagado" value={fmtMoney(b.paid, c.currency)} hint={`${b.percent}%`} tone="ok" />
                <Kpi label="Saldo" value={fmtMoney(b.pending, c.currency)} hint={b.next ? `Próx.: ${fmtDate(b.next.due_date)}` : undefined} />
                <Kpi label="Vencido" value={fmtMoney(b.overdueAmount, c.currency)} tone={b.overdueCount ? 'warn' : undefined} hint={b.overdueCount ? `${b.overdueCount} cuota(s)` : 'Al día'} />
              </div>
              {c.notes && <p className="glass panel notes">{c.notes}</p>}

              <div className="panel__head">
                <h3 className="section-title">Cuotas y pagos</h3>
                <div className="filters" style={{ marginBottom: 0 }}>
                  <button className="btn btn--ghost btn--sm" onClick={() => setUpselling(true)}>Registrar upsell</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => setPaymentModal('new')}>+ Agregar cuota / pago</button>
                </div>
              </div>
              <div className="glass table-wrap">
                <table className="table">
                  <thead><tr><th>#</th><th>Monto</th><th>Vencimiento</th><th>Estado</th><th>Pagado</th><th>Método</th><th /></tr></thead>
                  <tbody>
                    {payments.length === 0 && <tr><td colSpan={7} className="muted">Sin cuotas cargadas.</td></tr>}
                    {payments.map((p) => {
                      const st = paymentStatus(p, today);
                      return (
                        <tr key={p.id}>
                          <td>{p.installment_number ?? '—'}</td>
                          <td>{fmtMoney(Number(p.amount), p.currency)}{p.kind === 'upsell' && <> <Pill tone="accent">Upsell</Pill></>}</td>
                          <td>{fmtDate(p.due_date)}</td>
                          <td><Pill tone={st === 'pagado' ? 'ok' : st === 'vencido' ? 'warn' : 'muted'}>{st[0].toUpperCase() + st.slice(1)}</Pill></td>
                          <td>{fmtDate(p.paid_at)}</td>
                          <td>{p.method ?? '—'}{p.notes && <div className="cell-sub">{p.notes}</div>}</td>
                          <td className="cell-actions">
                            {p.paid_at ? (
                              <button className="btn btn--ghost btn--sm" onClick={() => unpay(p)}>Deshacer</button>
                            ) : (
                              <button className="btn btn--primary btn--sm" onClick={() => setPaying(p)}>Registrar pago</button>
                            )}
                            <button className="btn btn--ghost btn--sm" onClick={() => setPaymentModal(p)}>Editar</button>
                            <button className="btn btn--ghost btn--sm" onClick={() => removePayment(p)} aria-label="Eliminar">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="two-col">
                <ClientCommissions clientId={c.id} />
              </div>

              <div className="two-col">
                <section className="glass panel">
                  <h3 className="panel__title">Campus</h3>
                  {!profile && <p className="muted">Sin usuario del campus vinculado. Creá uno en Usuarios con el mismo email y se vincula solo.</p>}
                  {profile && summary && (
                    <>
                      <p className="muted">{profile.email} · {summary.overallPercent}% completado</p>
                      <div className="list">
                        {summary.perModule.map((m) => (
                          <div key={m.module.id} className="row row--static">
                            <div className="row__body">
                              <div className="row__head"><span>{m.module.title}</span><span className="muted">{m.done}/{m.total}</span></div>
                              <ProgressBar percent={m.percent} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </section>
                <section className="glass panel">
                  <h3 className="panel__title">Formularios pre-llamada ({responses.length})</h3>
                  {responses.length === 0 && <p className="muted">Todavía no respondió formularios.</p>}
                  <ul className="mini-list">
                    {responses.map((r) => (
                      <li key={r.id}>
                        <Link to={`/admin/respuestas/${r.id}`} className="mini-list__item">
                          <span>{r.slot_label ?? forms.find((f) => f.id === r.form_id)?.title ?? 'Formulario'} {!r.reviewed && <Pill tone="accent">Nueva</Pill>}</span>
                          <span className="muted">{r.call_date ? `Clase ${fmtDate(r.call_date)}` : fmtDateTime(r.submitted_at)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              {editing && <ClientFormModal client={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
              {paymentModal && (
                <PaymentModal client={c} payment={paymentModal === 'new' ? null : paymentModal} nextNumber={payments.length + 1} onClose={() => setPaymentModal(null)} onSaved={() => { setPaymentModal(null); reload(); }} />
              )}
              {upselling && <UpsellModal client={c} nextNumber={payments.length + 1} onClose={() => setUpselling(false)} onSaved={() => { setUpselling(false); reload(); }} />}
              {paying && <RegisterPaymentModal payment={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); reload(); }} />}
            </>
          );
        })()}
      </State>
    </>
  );
}

const METHODS = ['Transferencia', 'Tarjeta', 'Stripe', 'PayPal', 'Mercado Pago', 'Cripto', 'Efectivo'];

function RegisterPaymentModal({ payment, onClose, onSaved }: { payment: Payment; onClose: () => void; onSaved: () => void }) {
  const [paidAt, setPaidAt] = useState(todayISO());
  const [method, setMethod] = useState(METHODS[0]);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { error: err } = await supabase.from('payments').update({ paid_at: paidAt, method }).eq('id', payment.id);
    if (err) return setError(err.message);
    onSaved();
  };

  return (
    <Modal title={`Registrar pago · ${fmtMoney(Number(payment.amount), payment.currency)}`} onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Fecha de pago"><input className="field" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required /></Field>
        <Field label="Método">
          <input className="field" list="methods" value={method} onChange={(e) => setMethod(e.target.value)} />
          <datalist id="methods">{METHODS.map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary">Confirmar pago</button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentModal({ client, payment, nextNumber, onClose, onSaved }: { client: Client; payment: Payment | null; nextNumber: number; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    installment_number: String(payment?.installment_number ?? nextNumber),
    amount: payment ? String(payment.amount) : '',
    currency: payment?.currency ?? client.currency,
    due_date: payment?.due_date ?? todayISO(),
    paid_at: payment?.paid_at ?? '',
    method: payment?.method ?? '',
    notes: payment?.notes ?? '',
    kind: payment?.kind ?? 'venta',
  });
  const [error, setError] = useState('');
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!Number(v.amount)) return setError('Ingresá un monto');
    const payload = {
      client_id: client.id,
      installment_number: v.installment_number ? Number(v.installment_number) : null,
      amount: Number(v.amount),
      currency: v.currency.toUpperCase(),
      due_date: v.due_date || null,
      paid_at: v.paid_at || null,
      method: v.method || null,
      notes: v.notes || null,
      kind: v.kind,
    };
    const { error: err } = payment
      ? await supabase.from('payments').update(payload).eq('id', payment.id)
      : await supabase.from('payments').insert(payload);
    if (err) return setError(err.message);
    onSaved();
  };

  return (
    <Modal title={payment ? 'Editar cuota' : 'Nueva cuota / pago'} onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="N° de cuota"><input className="field" type="number" min="1" value={v.installment_number} onChange={set('installment_number')} /></Field>
        <Field label="Monto"><input className="field" type="number" min="0" step="0.01" value={v.amount} onChange={set('amount')} /></Field>
        <Field label="Moneda"><input className="field" value={v.currency} onChange={set('currency')} maxLength={3} /></Field>
        <Field label="Vencimiento"><input className="field" type="date" value={v.due_date} onChange={set('due_date')} /></Field>
        <Field label="Fecha de pago (vacío = pendiente)"><input className="field" type="date" value={v.paid_at} onChange={set('paid_at')} /></Field>
        <Field label="Método"><input className="field" list="methods2" value={v.method} onChange={set('method')} /></Field>
        <datalist id="methods2">{METHODS.map((m) => <option key={m} value={m} />)}</datalist>
        <Field label="Tipo">
          <select className="field field--select" value={v.kind} onChange={set('kind')}>
            <option value="venta">Venta</option>
            <option value="upsell">Upsell</option>
          </select>
        </Field>
        <Field label="Notas" full><input className="field" value={v.notes} onChange={set('notes')} /></Field>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Upsell: el cliente pasa a otro programa, el monto se suma al contrato y se crean sus cuotas marcadas como upsell. */
function UpsellModal({ client, nextNumber, onClose, onSaved }: { client: Client; nextNumber: number; onClose: () => void; onSaved: () => void }) {
  const [program, setProgram] = useState(client.program === 'Genesis Lite' ? 'Genesis OS' : client.program ?? 'Genesis OS');
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState('1');
  const [firstDue, setFirstDue] = useState(todayISO());
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [touched, setTouched] = useState(false);
  const [firstPaid, setFirstPaid] = useState(true);
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const total = Number(amount || 0);
  const n = Math.max(1, Math.min(24, Number(count || 1)));
  useEffect(() => {
    if (!touched) setPlan(equalPlan(total, n, firstDue));
  }, [total, n, firstDue, touched]);
  useEffect(() => {
    if (!touched) return;
    setPlan((rows) => (rows.length === n ? rows : rows.length > n ? rows.slice(0, n) : [...rows, ...Array.from({ length: n - rows.length }, (_, i) => ({ amount: '', due: addMonthsISO(firstDue, rows.length + i) }))]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
  const editRow = (i: number, patch: Partial<PlanRow>) => {
    setTouched(true);
    setPlan((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const planSum = Math.round(plan.reduce((acc, r) => acc + Number(r.amount || 0), 0) * 100) / 100;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!(total > 0)) return setError('Ingresá el monto del upsell');
    if (plan.some((r) => !(Number(r.amount) > 0) || !r.due)) return setError('Cada cuota necesita un monto mayor a 0 y una fecha');
    if (planSum !== total) return setError(`Las cuotas suman ${fmtMoney(planSum, client.currency)} y el upsell es de ${fmtMoney(total, client.currency)}`);
    setBusy(true);
    setError('');
    const today = todayISO();
    const rows = plan.map((r, i) => ({
      client_id: client.id,
      installment_number: nextNumber + i,
      amount: Number(r.amount),
      currency: client.currency,
      due_date: r.due,
      kind: 'upsell',
      paid_at: firstPaid && i === 0 ? today : null,
      method: firstPaid && i === 0 ? method || null : null,
      notes: `Upsell ${client.program ?? ''} → ${program}`.trim(),
    }));
    const { error: pErr } = await supabase.from('payments').insert(rows);
    if (pErr) {
      setBusy(false);
      return setError(pErr.message);
    }
    const { error: cErr } = await supabase
      .from('clients')
      .update({
        program,
        total_amount: Number(client.total_amount) + total,
        upsell_amount: Number(client.upsell_amount ?? 0) + total,
        installments_count: client.installments_count + rows.length,
      })
      .eq('id', client.id);
    if (cErr) {
      setBusy(false);
      return setError(`Las cuotas del upsell se crearon, pero no se pudo actualizar el cliente: ${cErr.message}`);
    }
    onSaved();
  };

  return (
    <Modal title={`Upsell · ${client.full_name}`} onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Pasa al programa">
          <select className="field field--select" value={program} onChange={(e) => setProgram(e.target.value)}>
            {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label={`Monto del upsell (${client.currency})`}><input className="field" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Cantidad de cuotas"><input className="field" type="number" min="1" max="24" value={count} onChange={(e) => setCount(e.target.value)} /></Field>
        <Field label="Primer vencimiento"><input className="field" type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} /></Field>
        {total > 0 && (
          <div className="afield--full plan">
            <div className="plan__head"><span>Cuota</span><span>Monto ({client.currency})</span><span>Vencimiento</span></div>
            {plan.map((r, i) => (
              <div key={i} className="plan__row">
                <span className="plan__n">{nextNumber + i}</span>
                <input className="field" type="number" min="0" step="0.01" value={r.amount} onChange={(e) => editRow(i, { amount: e.target.value })} aria-label={`Monto cuota ${i + 1}`} />
                <input className="field" type="date" value={r.due} onChange={(e) => editRow(i, { due: e.target.value })} aria-label={`Vencimiento cuota ${i + 1}`} />
              </div>
            ))}
            <div className="plan__foot">
              <span className={planSum !== total ? 'plan__warn' : 'muted'}>Suma de cuotas: {fmtMoney(planSum, client.currency)} de {fmtMoney(total, client.currency)}</span>
              {touched && <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setTouched(false); setPlan(equalPlan(total, n, firstDue)); }}>Repartir en partes iguales</button>}
            </div>
          </div>
        )}
        <label className="check afield--full">
          <input type="checkbox" checked={firstPaid} onChange={(e) => setFirstPaid(e.target.checked)} /> La primera cuota ya está cobrada (hoy)
        </label>
        {firstPaid && (
          <Field label="Método del primer pago">
            <input className="field" list="methods-upsell" value={method} onChange={(e) => setMethod(e.target.value)} />
            <datalist id="methods-upsell">{METHODS.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
        )}
        <p className="muted aform__note afield--full">
          El cliente pasa a {program}, el monto se suma al contrato ({fmtMoney(Number(client.total_amount), client.currency)} → {fmtMoney(Number(client.total_amount) + total, client.currency)}) y se crean las cuotas marcadas como upsell. Quien tenga % de upsell en este cliente cobra comisión sobre ellas. En Finanzas, el upsell se factura en el mes de su primer pago.
        </p>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Registrar upsell'}</button>
        </div>
      </form>
    </Modal>
  );
}
