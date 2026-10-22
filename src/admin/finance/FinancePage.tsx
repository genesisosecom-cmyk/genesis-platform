import { useMemo, useState, type FormEvent } from 'react';
import { useAsync } from '../../lib/useAsync';
import { supabase } from '../../lib/supabase';
import { fmtDate, fmtMoney, todayISO } from '../../lib/format';
import { Field, Kpi, Modal, Pill, State } from '../ui';
import { paymentStatus } from '../api';
import { fetchFinance, EXPENSE_CATEGORIES, TEAM_ROLES } from './api';
import {
  BASE_CURRENCY,
  computeMonth,
  firstMonth,
  foreignItems,
  monthOf,
  monthRange,
  payoutsByMember,
  sumMonths,
  type Expense,
  type FinanceData,
  type TeamMember,
} from './compute';

type Mode = 'month' | 'year' | 'all';

const usd = (n: number) => fmtMoney(n, BASE_CURRENCY);
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

export default function FinancePage() {
  const { data, loading, error, reload } = useAsync(fetchFinance, []);
  const current = monthOf(todayISO());
  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState(current);
  const [year, setYear] = useState(current.slice(0, 4));

  return (
    <>
      <div className="toolbar">
        <div className="chips">
          {(['month', 'year', 'all'] as const).map((m) => (
            <button key={m} className={`chip${mode === m ? ' is-active' : ''}`} onClick={() => setMode(m)}>
              {m === 'month' ? 'Mes' : m === 'year' ? 'Año' : 'Todo'}
            </button>
          ))}
          {mode === 'month' && <input className="field field--month" type="month" value={month} max={current} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
          {mode === 'year' && (
            <select className="field field--select" value={year} onChange={(e) => setYear(e.target.value)}>
              {Array.from({ length: 4 }, (_, i) => String(Number(current.slice(0, 4)) - i)).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
      </div>
      <State loading={loading} error={error}>
        {data && <Finance data={data} mode={mode} month={month} year={year} current={current} reload={reload} />}
      </State>
    </>
  );
}

function Finance({ data, mode, month, year, current, reload }: { data: FinanceData; mode: Mode; month: string; year: string; current: string; reload: () => void }) {
  const [memberModal, setMemberModal] = useState<TeamMember | 'new' | null>(null);
  const [expenseModal, setExpenseModal] = useState<Expense | 'new' | null>(null);
  const [payoutFor, setPayoutFor] = useState<TeamMember | null>(null);
  const [msg, setMsg] = useState('');

  const start = firstMonth(data, current);
  const months = useMemo(() => {
    if (mode === 'month') return [month];
    if (mode === 'year') return monthRange(`${year}-01`, year === current.slice(0, 4) ? current : `${year}-12`);
    return monthRange(start < current ? start : current, current);
  }, [mode, month, year, current, start]);

  const monthly = useMemo(() => months.map((m) => computeMonth(m, data)), [months, data]);
  const period = useMemo(() => sumMonths(monthly), [monthly]);
  // Saldo de cada miembro: todo lo generado desde el primer mes con datos menos todo lo pagado.
  const allTime = useMemo(() => sumMonths(monthRange(start < current ? start : current, current).map((m) => computeMonth(m, data))), [data, start, current]);
  const paidAllTime = payoutsByMember(data.payouts);
  const paidPeriod = payoutsByMember(data.payouts, months);
  const foreign = foreignItems(data);

  const pending = data.payments.filter((p) => !p.paid_at && p.currency === BASE_CURRENCY);
  const overdue = pending.filter((p) => paymentStatus(p) === 'vencido');
  const sum = (ps: typeof pending) => ps.reduce((s, p) => s + Number(p.amount), 0);

  const monthSet = new Set(months);
  const periodExpenses = data.expenses.filter((e) =>
    e.recurring ? months.some((m) => monthOf(e.date) <= m && (!e.end_date || m <= monthOf(e.end_date))) : monthSet.has(monthOf(e.date)),
  );
  const byCategory = Object.entries(
    periodExpenses.reduce<Record<string, number>>((acc, e) => {
      const times = e.recurring ? months.filter((m) => monthOf(e.date) <= m && (!e.end_date || m <= monthOf(e.end_date))).length : 1;
      if (e.currency === BASE_CURRENCY) acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount) * times;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const clientName = (id: string) => data.clients.find((c) => c.id === id)?.full_name ?? '—';
  const memberName = (id: string) => data.team.find((t) => t.id === id)?.name ?? '—';
  const visibleTeam = data.team.filter((t) => t.active || period.byMember[t.id]?.total || (allTime.byMember[t.id]?.total ?? 0) - (paidAllTime[t.id] ?? 0));

  const removeExpense = async (e: Expense) => {
    if (!window.confirm(`¿Eliminar el gasto "${e.concept}"?`)) return;
    const { error } = await supabase.from('expenses').delete().eq('id', e.id);
    setMsg(error ? error.message : '');
    reload();
  };
  const removePayout = async (id: string) => {
    if (!window.confirm('¿Eliminar este pago al equipo?')) return;
    const { error } = await supabase.from('team_payouts').delete().eq('id', id);
    setMsg(error ? error.message : '');
    reload();
  };

  const periodPayouts = data.payouts.filter((p) => monthSet.has(monthOf(p.date)));

  return (
    <>
      {foreign > 0 && <p className="fin-note">Hay {foreign} movimiento(s) en monedas distintas de USD que no se suman en estos totales.</p>}
      {msg && <p className="login__error">{msg}</p>}

      <div className="kpis kpis--4">
        <Kpi label="Facturación" value={usd(period.billing)} hint="Contratos nuevos del período" />
        <Kpi label="Cash collected" value={usd(period.cash)} tone="ok" hint="Cuotas cobradas" />
        <Kpi label="Gastos" value={usd(period.expenses)} />
        <Kpi label="Equipo" value={usd(period.commissions + period.fixed)} hint={`Comisiones ${usd(period.commissions)} · Fijos ${usd(period.fixed)}`} />
        <Kpi label="Resultado neto" value={usd(period.net)} tone={period.net < 0 ? 'warn' : undefined} hint="Cash − gastos − equipo" />
        <Kpi label="Reparto a socios" value={usd(period.profitShare)} />
        <Kpi label="Queda en la empresa" value={usd(period.retained)} tone={period.retained < 0 ? 'warn' : undefined} />
        <Kpi label="Por cobrar" value={usd(sum(pending))} tone={overdue.length ? 'warn' : undefined} hint={overdue.length ? `${usd(sum(overdue))} vencido` : 'Nada vencido'} />
      </div>

      {/* ---------- Equipo ---------- */}
      <div className="panel__head">
        <h3 className="section-title">Equipo · cuánto le corresponde a cada uno</h3>
        <button className="btn btn--ghost btn--sm" onClick={() => setMemberModal('new')}>+ Miembro del equipo</button>
      </div>
      <div className="glass table-wrap">
        <table className="table">
          <thead>
            <tr><th>Miembro</th><th>Comisiones</th><th>Fijo</th><th>Reparto</th><th>Le corresponde</th><th>Pagado</th><th>Saldo pendiente</th><th /></tr>
          </thead>
          <tbody>
            {visibleTeam.length === 0 && <tr><td colSpan={8} className="muted">Cargá a los miembros del equipo con su esquema: comisión, fijo mensual y/o % de reparto.</td></tr>}
            {visibleTeam.map((t) => {
              const e = period.byMember[t.id] ?? { commissions: 0, fixed: 0, profitShare: 0, total: 0 };
              const balance = Math.round(((allTime.byMember[t.id]?.total ?? 0) - (paidAllTime[t.id] ?? 0)) * 100) / 100;
              return (
                <tr key={t.id}>
                  <td>
                    <div className="cell-main">{t.name} <Pill tone="muted">{t.role}</Pill>{!t.active && <Pill tone="muted">Inactivo</Pill>}</div>
                    <div className="cell-sub">{schemeLabel(t)}</div>
                  </td>
                  <td>{usd(e.commissions)}</td>
                  <td>{usd(e.fixed)}</td>
                  <td>{usd(e.profitShare)}</td>
                  <td><strong>{usd(e.total)}</strong></td>
                  <td>{usd(paidPeriod[t.id] ?? 0)}</td>
                  <td>{balance > 0 ? <Pill tone="warn">{usd(balance)}</Pill> : <Pill tone="ok">Al día</Pill>}</td>
                  <td className="cell-actions">
                    <button className="btn btn--primary btn--sm" onClick={() => setPayoutFor(t)}>Registrar pago</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => setMemberModal(t)}>Editar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted fin-hint">"Le corresponde" y "Pagado" son del período elegido. El saldo pendiente es acumulado desde el primer mes con datos. Las comisiones se asignan en la ficha de cada cliente.</p>

      {/* ---------- Gastos ---------- */}
      <div className="panel__head">
        <h3 className="section-title">Gastos</h3>
        <button className="btn btn--ghost btn--sm" onClick={() => setExpenseModal('new')}>+ Gasto</button>
      </div>
      {byCategory.length > 0 && (
        <div className="fin-cats">
          {byCategory.map(([cat, total]) => (
            <span key={cat} className="fin-cat"><span className="muted">{cat}</span> {usd(total)}</span>
          ))}
        </div>
      )}
      <div className="glass table-wrap">
        <table className="table">
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Monto</th><th /></tr></thead>
          <tbody>
            {periodExpenses.length === 0 && <tr><td colSpan={5} className="muted">Sin gastos en este período.</td></tr>}
            {periodExpenses.map((e) => (
              <tr key={e.id}>
                <td>{e.recurring ? `Desde ${fmtDate(e.date)}` : fmtDate(e.date)}</td>
                <td>
                  <div className="cell-main">{e.concept} {e.recurring && <Pill tone="accent">Mensual</Pill>}</div>
                  {e.notes && <div className="cell-sub">{e.notes}</div>}
                </td>
                <td>{e.category}</td>
                <td>{fmtMoney(Number(e.amount), e.currency)}{e.recurring && <span className="muted"> /mes</span>}</td>
                <td className="cell-actions">
                  <button className="btn btn--ghost btn--sm" onClick={() => setExpenseModal(e)}>Editar</button>
                  <button className="btn btn--ghost btn--sm btn--danger" onClick={() => removeExpense(e)} aria-label="Eliminar">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- Comisiones ---------- */}
      <h3 className="section-title">Comisiones del período</h3>
      <div className="glass table-wrap">
        <table className="table">
          <thead><tr><th>Fecha de cobro</th><th>Cliente</th><th>Miembro</th><th>Cobrado</th><th>%</th><th>Comisión</th></tr></thead>
          <tbody>
            {period.commissionLines.length === 0 && <tr><td colSpan={6} className="muted">Sin comisiones en este período.</td></tr>}
            {[...period.commissionLines].sort((a, b) => b.date.localeCompare(a.date)).map((l) => (
              <tr key={`${l.paymentId}-${l.memberId}`}>
                <td>{fmtDate(l.date)}</td>
                <td>{clientName(l.clientId)}</td>
                <td>{memberName(l.memberId)}</td>
                <td>{usd(l.collected)}</td>
                <td>{l.pct}%</td>
                <td>{usd(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- Pagos al equipo ---------- */}
      <h3 className="section-title">Pagos al equipo del período</h3>
      <div className="glass table-wrap">
        <table className="table">
          <thead><tr><th>Fecha</th><th>Miembro</th><th>Monto</th><th>Nota</th><th /></tr></thead>
          <tbody>
            {periodPayouts.length === 0 && <tr><td colSpan={5} className="muted">Sin pagos registrados en este período.</td></tr>}
            {periodPayouts.map((p) => (
              <tr key={p.id}>
                <td>{fmtDate(p.date)}</td>
                <td>{memberName(p.member_id)}</td>
                <td>{fmtMoney(Number(p.amount), p.currency)}</td>
                <td className="muted">{p.notes ?? '—'}</td>
                <td className="cell-actions"><button className="btn btn--ghost btn--sm btn--danger" onClick={() => removePayout(p.id)} aria-label="Eliminar">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- Evolución ---------- */}
      {monthly.length > 1 && (
        <>
          <h3 className="section-title">Mes a mes</h3>
          <div className="glass table-wrap">
            <table className="table table--num">
              <thead><tr><th>Mes</th><th>Facturación</th><th>Cash collected</th><th>Gastos</th><th>Equipo</th><th>Neto</th><th>Reparto</th><th>Queda</th></tr></thead>
              <tbody>
                {[...monthly].reverse().map((r) => (
                  <tr key={r.month}>
                    <td>{monthLabel(r.month)}</td>
                    <td>{usd(r.billing)}</td>
                    <td>{usd(r.cash)}</td>
                    <td>{usd(r.expenses)}</td>
                    <td>{usd(r.commissions + r.fixed)}</td>
                    <td className={r.net < 0 ? 'plan__warn' : ''}>{usd(r.net)}</td>
                    <td>{usd(r.profitShare)}</td>
                    <td className={r.retained < 0 ? 'plan__warn' : ''}>{usd(r.retained)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {memberModal && <MemberModal member={memberModal === 'new' ? null : memberModal} onClose={() => setMemberModal(null)} onSaved={() => { setMemberModal(null); reload(); }} />}
      {expenseModal && <ExpenseModal expense={expenseModal === 'new' ? null : expenseModal} onClose={() => setExpenseModal(null)} onSaved={() => { setExpenseModal(null); reload(); }} />}
      {payoutFor && (
        <PayoutModal
          member={payoutFor}
          suggested={Math.max(0, Math.round(((allTime.byMember[payoutFor.id]?.total ?? 0) - (paidAllTime[payoutFor.id] ?? 0)) * 100) / 100)}
          onClose={() => setPayoutFor(null)}
          onSaved={() => { setPayoutFor(null); reload(); }}
        />
      )}
    </>
  );
}

function schemeLabel(t: TeamMember) {
  const parts = [];
  if (t.commission_pct) parts.push(`${t.commission_pct}% comisión`);
  if (t.monthly_fee) parts.push(`${usd(t.monthly_fee)} fijo/mes`);
  if (t.profit_share_pct) parts.push(`${t.profit_share_pct}% de la ganancia`);
  return parts.join(' · ') || 'Sin esquema cargado';
}

function MemberModal({ member, onClose, onSaved }: { member: TeamMember | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    name: member?.name ?? '',
    role: member?.role ?? 'Closer',
    commission_pct: String(member?.commission_pct ?? 0),
    monthly_fee: String(member?.monthly_fee ?? 0),
    profit_share_pct: String(member?.profit_share_pct ?? 0),
    start_date: member?.start_date ?? todayISO(),
    end_date: member?.end_date ?? '',
    active: member?.active ?? true,
  });
  const [error, setError] = useState('');
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return setError('Escribí el nombre');
    const pct = (x: string) => Math.min(100, Math.max(0, Number(x) || 0));
    const payload = {
      name: v.name.trim(),
      role: v.role,
      commission_pct: pct(v.commission_pct),
      monthly_fee: Math.max(0, Number(v.monthly_fee) || 0),
      profit_share_pct: pct(v.profit_share_pct),
      start_date: v.start_date || todayISO(),
      end_date: v.end_date || null,
      active: v.active,
    };
    const { error: err } = member ? await supabase.from('team_members').update(payload).eq('id', member.id) : await supabase.from('team_members').insert(payload);
    if (err) return setError(err.message);
    onSaved();
  };

  const remove = async () => {
    if (!member || !window.confirm(`¿Eliminar a ${member.name}? Se borran sus asignaciones de comisión y sus pagos registrados. Si solo dejó de trabajar, mejor cargá la fecha de baja.`)) return;
    const { error: err } = await supabase.from('team_members').delete().eq('id', member.id);
    if (err) return setError(err.message);
    onSaved();
  };

  return (
    <Modal title={member ? `Editar · ${member.name}` : 'Nuevo miembro del equipo'} onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Nombre"><input className="field" value={v.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Rol">
          <select className="field field--select" value={v.role} onChange={set('role')}>
            {TEAM_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Comisión por defecto (%)"><input className="field" type="number" min="0" max="100" step="0.5" value={v.commission_pct} onChange={set('commission_pct')} /></Field>
        <Field label="Fijo mensual (USD)"><input className="field" type="number" min="0" step="1" value={v.monthly_fee} onChange={set('monthly_fee')} /></Field>
        <Field label="Reparto de ganancia (%)"><input className="field" type="number" min="0" max="100" step="0.5" value={v.profit_share_pct} onChange={set('profit_share_pct')} /></Field>
        <Field label="Desde"><input className="field" type="date" value={v.start_date} onChange={set('start_date')} /></Field>
        <Field label="Fecha de baja (opcional)"><input className="field" type="date" value={v.end_date} onChange={set('end_date')} /></Field>
        <label className="check" style={{ alignSelf: 'end', paddingBottom: 12 }}>
          <input type="checkbox" checked={v.active} onChange={(e) => setV((s) => ({ ...s, active: e.target.checked }))} /> Activo
        </label>
        <p className="muted aform__note afield--full">
          La comisión se cobra sobre lo cobrado de los clientes que tenga asignados (se asignan en la ficha del cliente, con este % como sugerido). El reparto de ganancia se calcula sobre el resultado neto de cada mes.
        </p>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          {member && <button type="button" className="btn btn--ghost btn--danger" onClick={remove} style={{ marginRight: 'auto' }}>Eliminar</button>}
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function ExpenseModal({ expense, onClose, onSaved }: { expense: Expense | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    date: expense?.date ?? todayISO(),
    concept: expense?.concept ?? '',
    category: expense?.category ?? 'Publicidad',
    amount: expense ? String(expense.amount) : '',
    currency: expense?.currency ?? BASE_CURRENCY,
    recurring: expense?.recurring ?? false,
    end_date: expense?.end_date ?? '',
    notes: expense?.notes ?? '',
  });
  const [error, setError] = useState('');
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.concept.trim()) return setError('Escribí el concepto');
    if (!(Number(v.amount) >= 0) || v.amount === '') return setError('Ingresá un monto');
    const payload = {
      date: v.date,
      concept: v.concept.trim(),
      category: v.category.trim() || 'Otros',
      amount: Number(v.amount),
      currency: v.currency.toUpperCase() || BASE_CURRENCY,
      recurring: v.recurring,
      end_date: v.recurring && v.end_date ? v.end_date : null,
      notes: v.notes.trim() || null,
    };
    const { error: err } = expense ? await supabase.from('expenses').update(payload).eq('id', expense.id) : await supabase.from('expenses').insert(payload);
    if (err) return setError(err.message);
    onSaved();
  };

  return (
    <Modal title={expense ? 'Editar gasto' : 'Nuevo gasto'} onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Concepto" full><input className="field" value={v.concept} onChange={set('concept')} placeholder="Ej: Meta Ads, Skool, editor de video…" autoFocus /></Field>
        <Field label="Categoría">
          <input className="field" list="expense-cats" value={v.category} onChange={set('category')} />
          <datalist id="expense-cats">{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Monto"><input className="field" type="number" min="0" step="0.01" value={v.amount} onChange={set('amount')} /></Field>
        <Field label={v.recurring ? 'Desde' : 'Fecha'}><input className="field" type="date" value={v.date} onChange={set('date')} /></Field>
        <Field label="Moneda"><input className="field" value={v.currency} onChange={set('currency')} maxLength={3} /></Field>
        <label className="check afield--full">
          <input type="checkbox" checked={v.recurring} onChange={(e) => setV((s) => ({ ...s, recurring: e.target.checked }))} /> Se repite todos los meses (suscripciones, sueldos externos…)
        </label>
        {v.recurring && <Field label="Hasta (opcional, si se dio de baja)"><input className="field" type="date" value={v.end_date} onChange={set('end_date')} /></Field>}
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

function PayoutModal({ member, suggested, onClose, onSaved }: { member: TeamMember; suggested: number; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(suggested ? String(suggested) : '');
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!(Number(amount) > 0)) return setError('Ingresá un monto mayor a 0');
    const { error: err } = await supabase.from('team_payouts').insert({ member_id: member.id, amount: Number(amount), date, notes: notes.trim() || null, currency: BASE_CURRENCY });
    if (err) return setError(err.message);
    onSaved();
  };

  return (
    <Modal title={`Registrar pago · ${member.name}`} onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Monto (USD)"><input className="field" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Fecha"><input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Nota" full><input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: Comisiones de octubre" /></Field>
        <p className="muted aform__note afield--full">Saldo pendiente actual: {usd(suggested)}.</p>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary">Registrar pago</button>
        </div>
      </form>
    </Modal>
  );
}
