import { useState, type FormEvent } from 'react';
import { useAsync } from '../lib/useAsync';
import { supabase } from '../lib/supabase';
import { fetchSlots } from './api';
import { Field, Modal, Pill, State } from './ui';
import { PROGRAMS, WEEKDAYS, slotLabel, sortSlots } from '../data/schedule';
import type { CallType, ClassSlot } from '../lib/types';

/** Agenda de clases: define qué opciones ve cada programa en el formulario Pre-clase. */
export default function AgendaPage() {
  const { data, loading, error, reload } = useAsync(fetchSlots, []);
  const [editing, setEditing] = useState<ClassSlot | 'new' | null>(null);
  const slots = sortSlots(data ?? []);

  const toggle = async (s: ClassSlot) => {
    await supabase.from('class_slots').update({ active: !s.active }).eq('id', s.id);
    reload();
  };

  return (
    <>
      <div className="toolbar">
        <p className="muted">Estas son las clases que aparecen en el formulario Pre-clase según el programa del alumno.</p>
        <button className="btn btn--primary" onClick={() => setEditing('new')}>+ Nueva clase</button>
      </div>

      <State loading={loading} error={error} empty={!slots.length}>
        <div className="glass table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Clase</th>
                {PROGRAMS.map((p) => <th key={p}>{p}</th>)}
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="cell-main">{slotLabel(s)}</div>
                    <div className="cell-sub">{s.kind === 'grupal' ? 'Grupal semanal' : 'Individual a pedido'}</div>
                  </td>
                  {PROGRAMS.map((p) => <td key={p}>{s.programs.includes(p) ? <span className="agenda-check">✓</span> : <span className="muted">—</span>}</td>)}
                  <td>{s.active ? <Pill tone="ok">Activa</Pill> : <Pill tone="muted">Pausada</Pill>}</td>
                  <td className="cell-actions">
                    <button className="btn btn--ghost btn--sm" onClick={() => setEditing(s)}>Editar</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => toggle(s)}>{s.active ? 'Pausar' : 'Activar'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </State>

      {editing && (
        <SlotModal slot={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </>
  );
}

function SlotModal({ slot, onClose, onSaved }: { slot: ClassSlot | null; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<CallType>(slot?.kind ?? 'grupal');
  const [weekday, setWeekday] = useState(slot?.weekday ?? 1);
  const [time, setTime] = useState(slot?.start_time ?? '19:00');
  const [coach, setCoach] = useState(slot?.coach ?? '');
  const [programs, setPrograms] = useState<string[]>(slot?.programs ?? [...PROGRAMS]);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!coach.trim()) return setError('Indicá el coach');
    if (!programs.length) return setError('Elegí al menos un programa');
    const payload = {
      kind,
      weekday: kind === 'grupal' ? weekday : null,
      start_time: kind === 'grupal' ? time : null,
      coach: coach.trim(),
      programs: PROGRAMS.filter((p) => programs.includes(p)),
    };
    const { error: err } = slot
      ? await supabase.from('class_slots').update(payload).eq('id', slot.id)
      : await supabase.from('class_slots').insert(payload);
    if (err) return setError(err.message);
    onSaved();
  };

  const remove = async () => {
    if (!slot || !window.confirm(`¿Eliminar "${slotLabel(slot)}"? Las respuestas ya enviadas se conservan.`)) return;
    const { error: err } = await supabase.from('class_slots').delete().eq('id', slot.id);
    if (err) return setError(err.message);
    onSaved();
  };

  return (
    <Modal title={slot ? 'Editar clase' : 'Nueva clase'} onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Tipo" full>
          <div className="role-pick">
            <button type="button" className={`chip${kind === 'grupal' ? ' is-active' : ''}`} onClick={() => setKind('grupal')}>Grupal semanal</button>
            <button type="button" className={`chip${kind === '1:1' ? ' is-active' : ''}`} onClick={() => setKind('1:1')}>1:1 a pedido</button>
          </div>
        </Field>
        {kind === 'grupal' && (
          <>
            <Field label="Día">
              <select className="field field--select" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </select>
            </Field>
            <Field label="Hora"><input className="field" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          </>
        )}
        <Field label="Coach" full><input className="field" value={coach} onChange={(e) => setCoach(e.target.value)} placeholder="Ej: Manu" /></Field>
        <Field label="Programas que acceden" full>
          <div className="role-pick">
            {PROGRAMS.map((p) => (
              <label key={p} className="check">
                <input type="checkbox" checked={programs.includes(p)} onChange={(e) => setPrograms((ps) => (e.target.checked ? [...ps, p] : ps.filter((x) => x !== p)))} /> {p}
              </label>
            ))}
          </div>
        </Field>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          {slot && <button type="button" className="btn btn--ghost btn--danger" onClick={remove} style={{ marginRight: 'auto' }}>Eliminar</button>}
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
