import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { useLiveReload } from '../../lib/realtime';
import { fmtDate, relativeTime } from '../../lib/format';
import type { Client, Profile } from '../../lib/types';
import { fetchOnboardings, onboardingState } from '../../onboarding/api';
import { fetchClients, fetchProfiles } from '../api';
import { Kpi, Pill, State } from '../ui';
import { GiveAccessModal, LinkClientModal } from './AccessModals';
import { clientOnboarding, NEXT_ACTION, ONB_STEP_LABELS, ONB_STEPS, profileForClient } from './pipeline';

const load = () => Promise.all([fetchClients(), fetchProfiles(), fetchOnboardings()]);

type Filter = 'pendientes' | 'completos' | 'todos';

export default function OnboardingAdminPage() {
  const { data, loading, error, reload } = useAsync(load, []);
  useLiveReload(['clients', 'onboarding_responses'], reload, { delayMs: 1500 });
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('pendientes');
  const [query, setQuery] = useState('');
  const [giving, setGiving] = useState<Client | null>(null);
  const [linking, setLinking] = useState<Profile | null>(null);

  const [clients = [], profiles = [], rows = []] = data ?? [];
  const rowFor = (userId?: string | null) => (userId ? rows.find((r) => r.user_id === userId) : undefined);

  // Solo clientes en curso: los finalizados o dados de baja no tienen onboarding pendiente.
  const all = clients
    .filter((c) => c.status === 'activo' || c.status === 'pausado')
    .map((c) => {
      const profile = profileForClient(c, profiles);
      const row = rowFor(profile?.id);
      return { client: c, profile, row, st: clientOnboarding(c, profile, row) };
    });
  const q = query.trim().toLowerCase();
  const list = all
    .filter((r) => (filter === 'todos' ? true : filter === 'completos' ? !r.st.pending : Boolean(r.st.pending)))
    .filter((r) => !q || `${r.client.full_name} ${r.client.email ?? ''} ${r.client.program ?? ''} ${r.profile?.email ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => ONB_STEPS.indexOf(a.st.pending ?? 'kickoff') - ONB_STEPS.indexOf(b.st.pending ?? 'kickoff') || b.client.created_at.localeCompare(a.client.created_at));

  const linkedIds = new Set(clients.map((c) => c.profile_id).filter(Boolean));
  const orphans = profiles.filter((p) => p.role === 'member' && !linkedIds.has(p.id));
  const count = (k: (typeof ONB_STEPS)[number]) => all.filter((r) => r.st.pending === k).length;
  const unread = rows.filter((r) => r.completed_at && !r.reviewed).length;

  return (
    <>
      <div className="kpis kpis--4">
        <Kpi label="Sin acceso al campus" value={count('acceso')} tone={count('acceso') ? 'warn' : undefined} hint="Clientes activos sin usuario" />
        <Kpi label="Esperando formulario" value={count('ingreso') + count('formulario')} hint={`${count('ingreso')} todavía no ingresaron`} />
        <Kpi label="Formularios sin leer" value={unread} tone={unread ? 'warn' : undefined} />
        <Kpi label="Falta kickoff" value={count('kickoff')} hint={`${all.filter((r) => !r.st.pending).length} onboardings completos`} tone="ok" />
      </div>

      <div className="toolbar">
        <div className="chips">
          {(['pendientes', 'completos', 'todos'] as const).map((f) => (
            <button key={f} className={`chip${filter === f ? ' is-active' : ''}`} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="toolbar__right">
          <input className="field field--search" type="search" placeholder="Buscar cliente…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <State loading={loading} error={error}>
        <div className="glass table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Venta</th>
                <th>Avance</th>
                <th>Formulario</th>
                <th>Próximo paso</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={6} className="muted">{filter === 'pendientes' ? 'No hay onboardings pendientes.' : 'Sin clientes.'}</td></tr>}
              {list.map(({ client: c, profile, row, st }) => (
                <tr key={c.id} className="table__row" onClick={() => navigate(`/admin/clientes/${c.id}`)}>
                  <td>
                    <div className="cell-main">{c.full_name}</div>
                    <div className="cell-sub">{[c.program, profile?.email ?? c.email].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td>{fmtDate(c.start_date ?? c.created_at)}</td>
                  <td>
                    <span className="onb-steps" title={ONB_STEPS.map((k) => `${st.done[k] ? '✓' : '·'} ${ONB_STEP_LABELS[k]}`).join('\n')}>
                      {ONB_STEPS.map((k) => <span key={k} className={st.done[k] ? 'is-on' : ''} />)}
                    </span>
                  </td>
                  <td>
                    {st.form === 'completo' ? (
                      <>{row!.reviewed ? <Pill tone="ok">Enviado</Pill> : <Pill tone="accent">Sin leer</Pill>}</>
                    ) : st.form === 'en_curso' ? (
                      <span className="muted">{st.formSteps!.done}/{st.formSteps!.total} pasos · {relativeTime(row!.updated_at)}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{st.pending ? <Pill tone={st.pending === 'acceso' ? 'warn' : 'muted'}>{NEXT_ACTION[st.pending]}</Pill> : <Pill tone="ok">Completo</Pill>}</td>
                  <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                    {st.pending === 'acceso' && <button className="btn btn--primary btn--sm" onClick={() => setGiving(c)}>Dar acceso</button>}
                    {row && <Link className="btn btn--ghost btn--sm" to={`/admin/onboarding/${row.user_id}`}>Ver formulario</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel__head">
          <h3 className="section-title">Usuarios del campus sin ficha de cliente ({orphans.length})</h3>
        </div>
        <p className="muted" style={{ marginBottom: 14 }}>
          Alumnos que tienen usuario pero no están vinculados a un cliente: sus pagos y su programa no se ven juntos. Vinculalos a su ficha (si entraron con otro email) o creá la ficha en Clientes y pagos.
        </p>
        <div className="glass table-wrap">
          <table className="table">
            <thead><tr><th>Usuario</th><th>Alta</th><th>Última actividad</th><th>Onboarding</th><th /></tr></thead>
            <tbody>
              {orphans.length === 0 && <tr><td colSpan={5} className="muted">Todos los usuarios del campus están vinculados a un cliente.</td></tr>}
              {orphans.map((p) => {
                const row = rowFor(p.id);
                const st = onboardingState(row);
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="cell-main">{p.full_name || '—'}</div>
                      <div className="cell-sub">{p.email}</div>
                    </td>
                    <td>{fmtDate(p.created_at)}</td>
                    <td>{relativeTime(p.last_seen_at)}</td>
                    <td>{st === 'completo' ? <Pill tone="ok">Enviado</Pill> : st === 'en_curso' ? <Pill tone="accent">En curso</Pill> : <span className="muted">—</span>}</td>
                    <td className="cell-actions">
                      {row && <Link className="btn btn--ghost btn--sm" to={`/admin/onboarding/${p.id}`}>Ver formulario</Link>}
                      <button className="btn btn--primary btn--sm" onClick={() => setLinking(p)}>Vincular a cliente</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </State>

      {giving && <GiveAccessModal client={giving} onClose={() => setGiving(null)} onDone={reload} />}
      {linking && <LinkClientModal profile={linking} clients={clients} onClose={() => setLinking(null)} onDone={reload} />}
    </>
  );
}
