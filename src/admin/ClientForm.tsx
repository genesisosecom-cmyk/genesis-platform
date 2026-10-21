import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { addMonthsISO, todayISO } from '../lib/format';
import type { Client, ClientStatus } from '../lib/types';
import { Field, Modal } from './ui';

export const STATUS_LABELS: Record<ClientStatus, string> = {
  activo: 'Activo',
  pausado: 'Pausado',
  finalizado: 'Finalizado',
  baja: 'Baja',
};

/** Divide el total en cuotas mensuales iguales (la última absorbe el redondeo). */
export function buildSchedule(clientId: string, total: number, count: number, start: string, currency: string) {
  const base = Math.floor((total / count) * 100) / 100;
  return Array.from({ length: count }, (_, i) => ({
    client_id: clientId,
    installment_number: i + 1,
    amount: i === count - 1 ? Math.round((total - base * (count - 1)) * 100) / 100 : base,
    currency,
    due_date: addMonthsISO(start, i),
  }));
}

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
    notes: client?.notes ?? '',
  });
  const [generate, setGenerate] = useState(!client);
  const [firstDue, setFirstDue] = useState(todayISO());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.full_name.trim()) return setError('El nombre es obligatorio');
    const total = Number(v.total_amount || 0);
    const count = Math.max(1, Number(v.installments_count || 1));
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
    if (generate && total > 0) {
      const { error: err } = await supabase.from('payments').insert(buildSchedule(id, total, count, firstDue, payload.currency));
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
        <Field label="Programa / servicio"><input className="field" value={v.program} onChange={set('program')} placeholder="Ej: Mentoría 1:1 · 6 meses" /></Field>
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
            {client ? 'Agregar plan de cuotas mensuales' : 'Generar plan de cuotas mensuales'}
          </label>
          {generate && (
            <label className="afield">
              <span className="afield__label">Primer vencimiento</span>
              <input className="field" type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
            </label>
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
