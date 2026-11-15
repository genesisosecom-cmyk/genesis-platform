import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { fmtDate, fmtDateTime, relativeTime } from '../../lib/format';
import type { Client, Profile } from '../../lib/types';
import { setClientOnboarded, type OnboardingRow } from '../../onboarding/api';
import { Pill } from '../ui';
import { GiveAccessModal, LinkUserModal } from './AccessModals';
import { clientOnboarding, NEXT_ACTION, ONB_STEP_LABELS, ONB_STEPS, type OnbStepKey } from './pipeline';

/** Checklist del onboarding en la ficha del cliente, con las acciones de cada paso. */
export default function ClientOnboardingPanel({ client, profile, row, profiles, linkedIds, onChanged }: {
  client: Client;
  profile: Profile | null;
  row: OnboardingRow | null;
  /** Para vincular un usuario existente. */
  profiles: Profile[];
  linkedIds: Set<string>;
  onChanged: () => void;
}) {
  const [modal, setModal] = useState<'access' | 'link' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const st = clientOnboarding(client, profile, row);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const unlink = () =>
    window.confirm(`¿Desvincular a ${profile?.email} de esta ficha? El usuario sigue existiendo.`) &&
    run(async () => {
      const { error: err } = await supabase.from('clients').update({ profile_id: null }).eq('id', client.id);
      if (err) throw err;
    });

  const sub: Record<OnbStepKey, ReactNode> = {
    venta: `${client.program ?? 'Sin programa'} · ${fmtDate(client.start_date ?? client.created_at)}`,
    acceso: profile ? (
      <>
        {profile.email} · <button className="link link--btn" disabled={busy} onClick={unlink}>Desvincular</button>
      </>
    ) : (
      'Todavía no tiene usuario vinculado'
    ),
    ingreso: profile?.last_seen_at && !profile.must_change_password ? `Última actividad ${relativeTime(profile.last_seen_at)}` : profile ? 'Todavía no eligió su contraseña' : '—',
    formulario:
      st.form === 'completo'
        ? `Enviado el ${fmtDateTime(row!.completed_at)}`
        : st.form === 'en_curso'
          ? `En curso · ${st.formSteps!.done}/${st.formSteps!.total} pasos · ${relativeTime(row!.updated_at)}`
          : 'Sin empezar',
    kickoff: client.onboarded_at ? `Hecho el ${fmtDate(client.onboarded_at)}` : 'Falta',
  };

  return (
    <section className="glass panel">
      <div className="panel__head">
        <h3 className="panel__title">Onboarding</h3>
        {st.pending ? <Pill tone="accent">{NEXT_ACTION[st.pending]}</Pill> : <Pill tone="ok">Completo</Pill>}
      </div>
      <ul className="checklist">
        {ONB_STEPS.map((k) => (
          <li key={k} className={`checklist__item${st.done[k] ? ' is-done' : ''}`}>
            <span className="checklist__dot">{st.done[k] ? '✓' : ''}</span>
            <span className="checklist__body">
              <span>{ONB_STEP_LABELS[k]}</span>
              <span className="checklist__sub">{sub[k]}</span>
            </span>
            {k === 'formulario' && row && (
              <Link className="btn btn--ghost btn--sm" to={`/admin/onboarding/${row.user_id}`}>
                Ver respuestas {row.completed_at && !row.reviewed && <Pill tone="accent">Nueva</Pill>}
              </Link>
            )}
          </li>
        ))}
      </ul>
      <div className="aform__actions aform__actions--start">
        {!profile && (
          <>
            <button className="btn btn--primary btn--sm" onClick={() => setModal('access')}>Dar acceso al campus</button>
            <button className="btn btn--ghost btn--sm" onClick={() => setModal('link')}>Vincular usuario existente</button>
          </>
        )}
        {client.onboarded_at ? (
          <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => setClientOnboarded(client.id, false))}>Desmarcar kickoff</button>
        ) : (
          <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => window.confirm('¿Ya hiciste el kickoff / onboarding con este cliente?') && run(() => setClientOnboarded(client.id, true))}>
            Marcar kickoff hecho
          </button>
        )}
      </div>
      {error && <p className="login__error">{error}</p>}
      {modal === 'access' && <GiveAccessModal client={client} onClose={() => setModal(null)} onDone={onChanged} />}
      {modal === 'link' && <LinkUserModal client={client} profiles={profiles} linkedIds={linkedIds} onClose={() => setModal(null)} onDone={onChanged} />}
    </section>
  );
}
