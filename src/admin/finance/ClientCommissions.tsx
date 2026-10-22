import { useState } from 'react';
import { supabase, unwrap } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { Pill } from '../ui';
import type { ClientTeam, TeamMember } from './compute';

/** Ficha de cliente: quién cobra comisión por este cliente y con qué %. */
export default function ClientCommissions({ clientId }: { clientId: string }) {
  const { data, reload } = useAsync(
    () =>
      Promise.all([
        supabase.from('team_members').select('*').order('name').then((r) => unwrap(r) as TeamMember[]),
        supabase.from('client_team').select('*').eq('client_id', clientId).then((r) => unwrap(r) as ClientTeam[]),
      ]),
    [clientId],
  );
  const [memberId, setMemberId] = useState('');
  const [pct, setPct] = useState('');
  const [error, setError] = useState('');

  const [team = [], assigned = []] = data ?? [];
  const available = team.filter((t) => t.active && !assigned.some((a) => a.member_id === t.id));

  const pick = (id: string) => {
    setMemberId(id);
    setPct(String(team.find((t) => t.id === id)?.commission_pct ?? ''));
  };

  const add = async () => {
    const value = Number(pct);
    if (!memberId) return setError('Elegí un miembro');
    if (!(value > 0 && value <= 100)) return setError('El % tiene que estar entre 0 y 100');
    const { error: err } = await supabase.from('client_team').insert({ client_id: clientId, member_id: memberId, pct: value });
    if (err) return setError(err.message);
    setError('');
    setMemberId('');
    setPct('');
    reload();
  };

  const remove = async (id: string) => {
    await supabase.from('client_team').delete().eq('client_id', clientId).eq('member_id', id);
    reload();
  };

  return (
    <section className="glass panel">
      <h3 className="panel__title">Comisiones de esta venta</h3>
      <p className="muted fin-hint">Cada miembro cobra su % sobre cada cuota que se cobre de este cliente.</p>
      {assigned.length === 0 && <p className="muted">Nadie cobra comisión por este cliente.</p>}
      <ul className="mini-list">
        {assigned.map((a) => {
          const t = team.find((x) => x.id === a.member_id);
          return (
            <li key={a.member_id} className="mini-list__item">
              <span>{t?.name ?? '—'} {t && <Pill tone="muted">{t.role}</Pill>}</span>
              <span className="cell-actions">
                <strong>{Number(a.pct)}%</strong>
                <button className="btn btn--ghost btn--sm" onClick={() => remove(a.member_id)} aria-label="Quitar">✕</button>
              </span>
            </li>
          );
        })}
      </ul>
      {team.length === 0 ? (
        <p className="muted">Primero cargá al equipo en Finanzas.</p>
      ) : available.length > 0 && (
        <div className="commission-add">
          <select className="field field--select" value={memberId} onChange={(e) => pick(e.target.value)}>
            <option value="">Agregar miembro…</option>
            {available.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.role}</option>)}
          </select>
          <input className="field field--num" type="number" min="0" max="100" step="0.5" placeholder="%" value={pct} onChange={(e) => setPct(e.target.value)} />
          <button className="btn btn--ghost btn--sm" onClick={add}>Agregar</button>
        </div>
      )}
      {error && <p className="login__error">{error}</p>}
    </section>
  );
}
