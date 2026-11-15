import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, unwrap } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { useLiveReload } from '../../lib/realtime';
import { fmtDateTime, relativeTime } from '../../lib/format';
import type { Client, Profile } from '../../lib/types';
import { fetchOnboarding, updateOnboarding } from '../../onboarding/api';
import { completedSteps } from '../../onboarding/questions';
import { ArrowLeft } from '../../components/Icons';
import { Pill, State } from '../ui';
import OnboardingAnswers from './OnboardingAnswers';

async function load(userId: string) {
  const [row, profile, clients] = await Promise.all([
    fetchOnboarding(userId),
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle().then((r) => unwrap(r) as Profile | null),
    supabase.from('clients').select('*').eq('profile_id', userId).then((r) => unwrap(r) as Client[]),
  ]);
  return { row, profile, client: clients[0] ?? null };
}

export default function OnboardingDetailPage() {
  const { userId = '' } = useParams();
  const { data, loading, error, reload } = useAsync(() => load(userId), [userId]);
  useLiveReload(['onboarding_responses'], reload, { delayMs: 1500 });
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => setNotes(data?.row?.admin_notes ?? ''), [data?.row?.admin_notes]);

  const patch = async (p: Parameters<typeof updateOnboarding>[1]) => {
    try {
      await updateOnboarding(userId, p);
      setMsg('Guardado');
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <>
      <Link to="/admin/onboarding" className="back"><ArrowLeft width={16} height={16} /> Onboarding</Link>
      <State loading={loading} error={error}>
        {data && (() => {
          const { row, profile, client } = data;
          if (!row) return <p className="muted">Este usuario todavía no empezó el formulario de onboarding.</p>;
          const steps = completedSteps(row.answers);
          return (
            <>
              <div className="detail-head">
                <div>
                  <span className="eyebrow">{client?.program ?? 'Formulario de onboarding'}</span>
                  <h2 className="page__title page__title--sm">{profile?.full_name || profile?.email || 'Usuario eliminado'}</h2>
                  <div className="detail-meta">
                    {row.completed_at ? <Pill tone="ok">Enviado {fmtDateTime(row.completed_at)}</Pill> : <Pill tone="accent">En curso · {steps.done}/{steps.total} pasos</Pill>}
                    {row.completed_at && (row.reviewed ? <Pill tone="muted">Leído</Pill> : <Pill tone="accent">Sin leer</Pill>)}
                    <span>Última edición {relativeTime(row.updated_at)}</span>
                    {profile && <span>{profile.email}</span>}
                    {client ? <Link className="link" to={`/admin/clientes/${client.id}`}>Ver ficha de cliente →</Link> : <Pill tone="warn">Sin ficha de cliente</Pill>}
                  </div>
                </div>
                <div className="aform__actions">
                  <button className="btn btn--ghost" onClick={() => patch({ reviewed: !row.reviewed })}>{row.reviewed ? 'Marcar como no leído' : 'Marcar como leído'}</button>
                </div>
              </div>

              <div className="onb-detail">
                <section className="glass panel">
                  <OnboardingAnswers answers={row.answers} />
                </section>
                <section className="glass panel onb-detail__notes">
                  <h3 className="panel__title">Notas internas</h3>
                  <textarea className="field field--area" rows={8} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Diagnóstico, plan para el kickoff, alertas…" />
                  <div className="aform__actions aform__actions--start">
                    <button className="btn btn--primary btn--sm" onClick={() => patch({ admin_notes: notes.trim() || null })}>Guardar notas</button>
                    {msg && <span className="muted">{msg}</span>}
                  </div>
                </section>
              </div>
            </>
          );
        })()}
      </State>
    </>
  );
}
