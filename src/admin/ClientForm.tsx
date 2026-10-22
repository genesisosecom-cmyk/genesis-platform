import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { addMonthsISO, fmtMoney, todayISO } from '../lib/format';
import type { Client, ClientStatus } from '../lib/types';
import { Field, Modal } from './ui';
import { PROGRAMS } from '../data/schedule';

export const STATUS_LABELS: Record<ClientStatus, string> = {
  activo: 'Activo',
  pausado: 'Pausado',
  finalizado: 'Finalizado',
  baja: 'Baja',
};

/** Divide el total en `count` partes iguales (la última absorbe el redondeo). */
export function splitEqually(total: number, count: number) {
  const base = Math.floor((total / count) * 100) / 100;
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? Math.round((total - base * (count - 1)) * 100) / 100 : base));
}

interface PlanRow {
  amount: string;
  due: string;
}

const equalPlan = (total: number, count: number, firstDue: string): PlanRow[] =>
  splitEqually(total, count).map((a, i) => ({ amount: total ? String(a) : '', due: addMonthsISO(firstDue, i) }));

export default function ClientFormModal({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved: (id: string) => void }) {
  const [v, setV] = useState({
    full_name: client?.full_name ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    company: client?.company ?? '',
    program: client?.program ?? '',
    status: client?.status ?? ('activo' as ClientStatus),
    start_date: client?.start_date ?? todayISO(),
    end_date: client?.end_date ?? '',
    total_amount: client ? String(client.total_amount) : '',
    currency: client?.currency ?? 'USD',
    installments_count: client ? String(client.installments_count) : '1',
    discord_channel: client?.discord_channel ?? '',
    notes: client?.notes ?? '',
  });
  const [generate, setGenerate] = useState(!client);
  const [firstDue, setFirstDue] = useState(todayISO());
  // Plan de cuotas editable: se reparte en partes iguales hasta que el admin toca un monto o fecha.
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [planTouched, setPlanTouched] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const total = Number(v.total_amount || 0);
  const count = Math.max(1, Math.min(60, Number(v.installments_count || 1)));

  useEffect(() => {
    if (!planTouched) setPlan(equalPlan(total, count, firstDue));
  }, [total, count, firstDue, planTouched]);

  // Si ya se editaron montos y cambia la cantidad de cuotas, se agregan o quitan al final.
  useEffect(() => {
    if (!planTouched) return;
    setPlan((rows) =>
      rows.length === count
        ? rows
        : rows.length > count
          ? rows.slice(0, count)
          : [...rows, ...Array.from({ length: count - rows.length }, (_, i) => ({ amount: '', due: addMonthsISO(firstDue, rows.length + i) }))],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const editRow = (i: number, patch: Partial<PlanRow>) => {
    setPlanTouched(true);
    setPlan((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const resetPlan = () => {
    setPlanTouched(false);
    setPlan(equalPlan(total, count, firstDue));
  };
  const planSum = Math.round(plan.reduce((acc, r) => acc + Number(r.amount || 0), 0) * 100) / 100;
  const currency = v.currency.toUpperCase() || 'USD';
  // Sin monto total y sin tocar el plan, no se crean cuotas (se pueden cargar después).
  const wantsPlan = generate && (total > 0 || planTouched);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.full_name.trim()) return setError('El nombre es obligatorio');
    if (wantsPlan && plan.some((r) => !(Number(r.amount) > 0) || !r.due)) return setError('Cada cuota necesita un monto mayor a 0 y una fecha');
    setSaving(true);
    const payload = {
      ...v,
      full_name: v.full_name.trim(),
      email: v.email.trim().toLowerCase() || null,
      phone: v.phone || null,
      company: v.company || null,
      program: v.program || null,
      start_date: v.start_date || null,
      end_date: v.end_date || null,
      notes: v.notes || null,
      discord_channel: v.discord_channel.trim() || null,
      total_amount: total,
      installments_count: count,
      currency: v.currency.toUpperCase(),
    };
    const res = client
      ? await supabase.from('clients').update(payload).eq('id', client.id).select('id').single()
      : await supabase.from('clients').insert(payload).select('id').single();
    if (res.error) {
      setSaving(false);
      return setError(res.error.message);
    }
    const id = (res.data as { id: string }).id;
    if (wantsPlan && plan.length) {
      // Al editar un cliente, las cuotas nuevas siguen la numeración de las existentes.
      const { count: existing } = client
        ? await supabase.from('payments').select('id', { count: 'exact', head: true }).eq('client_id', id)
        : { count: 0 };
      const rows = plan.map((r, i) => ({
        client_id: id,
        installment_number: (existing ?? 0) + i + 1,
        amount: Number(r.amount),
        currency: payload.currency,
        due_date: r.due,
      }));
      const { error: err } = await supabase.from('payments').insert(rows);
      if (err) {
        setSaving(false);
        return setError(`Cliente guardado, pero no se pudieron crear las cuotas: ${err.message}`);
      }
    }
    // Vincula con el usuario del campus que tenga el mismo email.
    if (payload.email) {
      const { data: prof } = await supabase.from('profiles').select('id').ilike('email', payload.email.replace(/[\\%_]/g, '\\$&')).maybeSingle();
      if (prof) await supabase.from('clients').update({ profile_id: (prof as { id: string }).id }).eq('id', id);
    }
    onSaved(id);
  };

  return (
    <Modal title={client ? 'Editar cliente' : 'Nuevo cliente'} onClose={onClose} wide>
      <form className="aform" onSubmit={submit}>
        <Field label="Nombre y apellido"><input className="field" value={v.full_name} onChange={set('full_name')} /></Field>
        <Field label="Email"><input className="field" type="email" value={v.email} onChange={set('email')} /></Field>
        <Field label="Teléfono / WhatsApp"><input className="field" value={v.phone} onChange={set('phone')} /></Field>
        <Field label="Empresa"><input className="field" value={v.company} onChange={set('company')} /></Field>
        <Field label="Canal de Discord"><input className="field" value={v.discord_channel} onChange={set('discord_channel')} placeholder="#nombre-del-canal" /></Field>
        <Field label="Programa">
          <input className="field" list="programs" value={v.program} onChange={set('program')} placeholder="Genesis OG, Fast Subscription, Genesis OS…" />
          <datalist id="programs">{PROGRAMS.map((p) => <option key={p} value={p} />)}</datalist>
        </Field>
        <Field label="Estado">
          <select className="field field--select" value={v.status} onChange={set('status')}>
            {Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Inicio"><input className="field" type="date" value={v.start_date} onChange={set('start_date')} /></Field>
        <Field label="Fin"><input className="field" type="date" value={v.end_date} onChange={set('end_date')} /></Field>
        <Field label="Monto total"><input className="field" type="number" min="0" step="0.01" value={v.total_amount} onChange={set('total_amount')} /></Field>
        <Field label="Moneda"><input className="field" value={v.currency} onChange={set('currency')} maxLength={3} /></Field>
        <Field label="Cantidad de cuotas"><input className="field" type="number" min="1" value={v.installments_count} onChange={set('installments_count')} /></Field>
        <Field label="Notas" full><textarea className="field field--area" rows={3} value={v.notes} onChange={set('notes')} /></Field>

        <div className="afield--full gen-box">
          <label className="check">
            <input type="checkbox" checked={generate} onChange={(e) => setGenerate(e.target.checked)} />
            {client ? 'Agregar plan de cuotas' : 'Generar plan de cuotas'}
          </label>
          {generate && (
            <>
              <label className="afield">
                <span className="afield__label">Primer vencimiento</span>
                <input className="field" type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
              </label>
              <div className="plan">
                <div className="plan__head">
                  <span>Cuota</span>
                  <span>Monto ({currency})</span>
                  <span>Vencimiento</span>
                </div>
                {plan.map((r, i) => (
                  <div key={i} className="plan__row">
                    <span className="plan__n">{i + 1}</span>
                    <input className="field" type="number" min="0" step="0.01" value={r.amount} onChange={(e) => editRow(i, { amount: e.target.value })} aria-label={`Monto cuota ${i + 1}`} />
                    <input className="field" type="date" value={r.due} onChange={(e) => editRow(i, { due: e.target.value })} aria-label={`Vencimiento cuota ${i + 1}`} />
                  </div>
                ))}
                <div className="plan__foot">
                  <span className={total && planSum !== total ? 'plan__warn' : 'muted'}>
                    Suma de cuotas: {fmtMoney(planSum, currency)}
                    {total ? ` de ${fmtMoney(total, currency)}` : ''}
                    {total && planSum !== total ? ` · diferencia ${fmtMoney(total - planSum, currency)}` : ''}
                  </span>
                  {planTouched && (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={resetPlan}>Repartir en partes iguales</button>
                  )}
                </div>
                <p className="muted plan__hint">Podés editar el monto y la fecha de cada cuota. La cantidad sale de "Cantidad de cuotas".</p>
              </div>
            </>
          )}
        </div>

        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
