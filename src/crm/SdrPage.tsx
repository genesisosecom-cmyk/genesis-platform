import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from '../lib/useAsync';
import { Kpi, Modal, State } from '../admin/ui';
import { fmtMoney } from '../lib/format';
import type { Launch } from '../lib/types';
import {
  fetchAgents,
  fetchCalls,
  fetchCommissions,
  fetchLaunches,
  fetchLaunchProgress,
  fetchLeadRow,
  fetchLeadRows,
  fetchSalesReps,
  fetchSettings,
  type CallRow,
  type LeadRow,
} from './api';
import { byLevel, followupDue, inList, INVESTMENT_LEVELS, LISTS, periodRange, sdrReview, type ListKey } from './model';
import LeadCard, { type CardContext } from './LeadCard';
import TeamMetricsPanel from './TeamMetricsPanel';
import { changedId, useLiveReload, useRealtime, type Change } from '../lib/realtime';
import { NewLeadModal, ResourcesModal } from './modals';
import { CallCalendar, CommissionCards, LaunchGoal, realNumbers, ScopeToggle, Simulator } from './widgets';

type Tab = 'leads' | 'resumen' | 'metricas' | 'calendario';

export default function SdrPage() {
  const { rep, isSdr, isAdmin } = useAuth();
  const launches = useAsync(fetchLaunches, []);
  const [picked, setPicked] = useState<string | null>(null);
  const launch = launches.data?.find((l) => l.id === picked) ?? launches.data?.find((l) => l.is_current) ?? launches.data?.[0] ?? null;

  return (
    <div className="fade-in">
      <header className="page__header">
        <span className="eyebrow">Panel SDR{rep && isSdr ? ` · ${rep.name}` : ''}</span>
        <h1 className="page__title">Leads</h1>
      </header>
      {!isSdr && !isAdmin ? (
        <p className="muted">Tu usuario no está cargado como SDR.</p>
      ) : (
        <State loading={launches.loading} error={launches.error} empty={!launch}>
          {launch && (
            <SdrWorkspace
              key={launch.id}
              launch={launch}
              me={isSdr ? rep!.id : null}
              isAdmin={isAdmin}
              picker={
                launches.data!.length > 1 && (
                  <select className="field field--select" value={launch.id} onChange={(e) => setPicked(e.target.value)}>
                    {launches.data!.map((l) => <option key={l.id} value={l.id}>{l.name}{l.is_current ? ' (actual)' : ''}</option>)}
                  </select>
                )
              }
            />
          )}
        </State>
      )}
    </div>
  );
}

async function load(launchId: string) {
  const [rows, reps, agents, calls, progress, settings] = await Promise.all([
    fetchLeadRows(launchId),
    fetchSalesReps(),
    fetchAgents(),
    fetchCalls({ launchId }),
    fetchLaunchProgress(launchId),
    fetchSettings().catch(() => null),
  ]);
  return { rows, reps, agents, calls, progress, settings };
}

function SdrWorkspace({ launch, me, isAdmin, picker }: { launch: Launch; me: string | null; isAdmin: boolean; picker: React.ReactNode }) {
  const { leadLaunchId } = useParams();
  const { data, loading, error, reload } = useAsync(() => load(launch.id), [launch.id]);
  // Filas actualizadas después de la carga (acciones propias o cambios en tiempo real). null = ya no se ve.
  const [patched, setPatched] = useState<Record<string, LeadRow | null>>({});
  const [tab, setTab] = useState<Tab>('leads');
  const [list, setList] = useState<ListKey>(me ? 'mios' : 'bolsa');
  const [scope, setScope] = useState<'mine' | 'team'>(me ? 'mine' : 'team');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [callOpen, setCallOpen] = useState<CallRow | null>(null);

  useEffect(() => setPatched({}), [data]);

  const rows = useMemo(() => {
    const base = data?.rows ?? [];
    const known = new Set(base.map((r) => r.id));
    const updated = base.flatMap((r) => (r.id in patched ? (patched[r.id] ? [patched[r.id]!] : []) : [r]));
    const added = Object.values(patched).filter((r): r is LeadRow => Boolean(r && !known.has(r.id)));
    return [...added, ...updated];
  }, [data, patched]);

  // Tiempo real: cada lead que cambia se vuelve a leer solo (no se recarga la lista entera).
  const refetchRows = async (ids: string[]) => {
    const fresh = await Promise.all(ids.map((id) => fetchLeadRow(id).catch(() => null)));
    setPatched((p) => ({ ...p, ...Object.fromEntries(ids.map((id, i) => [id, fresh[i] && fresh[i]!.launch_id === launch.id ? fresh[i] : null])) }));
  };
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useRealtime(
    [{ table: 'lead_launches', filter: `launch_id=eq.${launch.id}` }, { table: 'leads', event: 'UPDATE' }],
    (changes: Change[]) => {
      const ids = new Set<string>();
      for (const c of changes) {
        const id = changedId(c);
        if (!id) continue;
        if (c.table === 'leads') rowsRef.current.filter((r) => r.lead_id === id).forEach((r) => ids.add(r.id));
        else ids.add(id);
      }
      if (ids.size) refetchRows([...ids]);
    },
    { delayMs: 600 },
  );
  // Calls, pagos y meta del lanzamiento: se recarga el panel (son pocas filas).
  useLiveReload(['sales_calls', 'payments', 'sales_reps', 'crm_agents'], reload, { delayMs: 1500 });
  const reps = data?.reps ?? [];
  const who = scope === 'mine' ? me : null;

  const ctx: CardContext = {
    reps,
    agents: data?.agents ?? [],
    launchStartsAt: launch.starts_at,
    me,
    isAdmin,
    refresh: async (id) => {
      const row = await fetchLeadRow(id);
      setPatched((p) => ({ ...p, [id]: row }));
    },
  };

  const q = query.trim().toLowerCase();
  const matches = (r: LeadRow) => {
    if (!q) return true;
    const owner = reps.find((x) => x.id === r.lead.sdr_id)?.name ?? 'sin sdr';
    return `${r.lead.full_name} ${r.lead.email ?? ''} ${r.lead.phone ?? ''} ${r.inversion_meta ?? ''} ${owner}`.toLowerCase().includes(q);
  };
  const counts = Object.fromEntries(LISTS.map((x) => [x.key, rows.filter((r) => inList(x.key, r, who)).length])) as Record<ListKey, number>;
  const visible = rows.filter((r) => inList(list, r, who) && matches(r));
  // Con búsqueda, busca en todas las listas.
  const searchHits = q ? rows.filter(matches) : [];
  const review = me ? sdrReview(rows, me) : [];
  const dueCount = rows.filter((r) => (!who || r.lead.sdr_id === who) && followupDue(r)).length;
  const focused = leadLaunchId ? rows.find((r) => r.id === leadLaunchId) : null;

  return (
    <>
      <nav className="tabs">
        {([['leads', 'Leads'], ['resumen', 'Resumen'], ['metricas', 'Métricas'], ['calendario', 'Calendario']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} type="button" className={`tabs__link tabs__btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </nav>

      <State loading={loading} error={error}>
        {data && <LaunchGoal launch={launch} progress={data.progress} />}

        {tab === 'leads' && data && (
          <>
            <div className="toolbar">
              <div className="filters" style={{ marginBottom: 0 }}>
                {picker}
                {me && isAdmin && <ScopeToggle value={scope} onChange={setScope} />}
              </div>
              <div className="toolbar__right">
                <input className="field field--search" type="search" placeholder="Nombre, mail, teléfono, inversión o SDR…" value={query} onChange={(e) => setQuery(e.target.value)} />
                <button className="btn btn--ghost" onClick={() => setResourcesOpen(true)}>Recursos</button>
                <button className="btn btn--primary" onClick={() => setCreating(true)}>+ Nuevo lead</button>
              </div>
            </div>

            {focused && (
              <div className="stack" style={{ marginBottom: 20 }}>
                <LeadCard row={focused} ctx={ctx} defaultOpen />
              </div>
            )}

            {review.length > 0 && (
              <section className="glass panel review">
                <button type="button" className="panel__head link--btn" onClick={() => setReviewOpen((o) => !o)}>
                  <h2 className="panel__title">Para revisar · {review.length}</h2>
                  <span className="muted">{reviewOpen ? 'Ocultar' : 'Ver'}</span>
                </button>
                {reviewOpen && (
                  <ul className="mini-list">
                    {review.map((r) => <li key={r.id}><span className="mini-list__item">{r.text}</span></li>)}
                  </ul>
                )}
              </section>
            )}

            {q ? (
              <>
                <p className="muted">{searchHits.length} resultado(s) en todas las listas.</p>
                <div className="stack">{searchHits.sort(byLevel).slice(0, 100).map((r) => <LeadCard key={r.id} row={r} ctx={ctx} />)}</div>
              </>
            ) : (
              <>
                <div className="ltabs">
                  {LISTS.filter((x) => !x.more).map((x) => (
                    <button key={x.key} type="button" className={`chip${list === x.key ? ' is-active' : ''}`} onClick={() => setList(x.key)}>
                      {x.label} <span className="muted">{counts[x.key]}</span>
                      {x.key === 'seguimientos' && dueCount > 0 && <span className="dot" title={`${dueCount} para hoy`} />}
                    </button>
                  ))}
                  <span className="ltabs__more muted">Otras listas:</span>
                  {LISTS.filter((x) => x.more).map((x) => (
                    <button key={x.key} type="button" className={`chip chip--sm${list === x.key ? ' is-active' : ''}`} onClick={() => setList(x.key)}>
                      {x.label} <span className="muted">{counts[x.key]}</span>
                    </button>
                  ))}
                </div>
                <p className="muted">{LISTS.find((x) => x.key === list)?.hint}</p>
                <LeadGroups rows={visible} list={list} ctx={ctx} />
              </>
            )}
          </>
        )}

        {tab === 'resumen' && data && <SdrSummary rows={rows} calls={data.calls} me={me} pct={Number(data.settings?.sdr_commission_pct ?? 3)} />}

        {tab === 'metricas' && <TeamMetricsPanel launchId={launch.id} picker={picker} only="sdr" />}

        {tab === 'calendario' && data && (
          <>
            {me && isAdmin && <div className="filters"><ScopeToggle value={scope} onChange={setScope} /></div>}
            <CallCalendar calls={data.calls.filter((c) => !who || c.sdr_id === who)} reps={reps} showCloser onOpen={setCallOpen} />
          </>
        )}
      </State>

      {callOpen && (
        <Modal title="Lead de la call" onClose={() => setCallOpen(null)} wide>
          <LeadCard row={rows.find((r) => r.id === callOpen.lead_launch_id) ?? callOpen.lead_launch} ctx={ctx} defaultOpen />
        </Modal>
      )}
      {creating && (
        <NewLeadModal
          closers={reps.filter((r) => r.closer_status === 'activo')}
          canAssign={Boolean(me)}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {resourcesOpen && <ResourcesModal role="sdr" onClose={() => setResourcesOpen(false)} />}
    </>
  );
}

/** Mis leads se agrupa por nivel de inversión (de mayor a menor); el resto, lista ordenada. */
function LeadGroups({ rows, list, ctx }: { rows: LeadRow[]; list: ListKey; ctx: CardContext }) {
  const [limit, setLimit] = useState(60);
  if (!rows.length) return <div className="state muted">No hay leads en esta lista.</div>;
  if (list === 'seguimientos') {
    const sorted = [...rows].sort((a, b) => (a.next_followup_at ?? '9999').localeCompare(b.next_followup_at ?? '9999'));
    return <div className="stack">{sorted.slice(0, limit).map((r) => <LeadCard key={r.id} row={r} ctx={ctx} />)}<More n={sorted.length} limit={limit} setLimit={setLimit} /></div>;
  }
  if (list !== 'mios' && list !== 'bolsa') {
    const sorted = [...rows].sort(byLevel);
    return <div className="stack">{sorted.slice(0, limit).map((r) => <LeadCard key={r.id} row={r} ctx={ctx} />)}<More n={sorted.length} limit={limit} setLimit={setLimit} /></div>;
  }
  const groups = [...INVESTMENT_LEVELS, 'Sin dato'].map((lvl) => ({
    lvl,
    items: rows.filter((r) => (r.inversion_meta ?? 'Sin dato') === lvl || (lvl === 'Sin dato' && r.inversion_meta && !INVESTMENT_LEVELS.includes(r.inversion_meta))).sort(byLevel),
  }));
  return (
    <div className="stack">
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.lvl}>
          <h3 className="section-title section-title--sm">{g.lvl} · {g.items.length}</h3>
          <div className="stack">{g.items.slice(0, limit).map((r) => <LeadCard key={r.id} row={r} ctx={ctx} />)}</div>
        </section>
      ))}
      <More n={Math.max(...groups.map((g) => g.items.length))} limit={limit} setLimit={setLimit} />
    </div>
  );
}

function More({ n, limit, setLimit }: { n: number; limit: number; setLimit: (n: number) => void }) {
  if (n <= limit) return null;
  return <button className="btn btn--ghost" onClick={() => setLimit(limit + 60)}>Ver más ({n - limit})</button>;
}

function SdrSummary({ rows, calls, me, pct }: { rows: LeadRow[]; calls: CallRow[]; me: string | null; pct: number }) {
  const [period, setPeriod] = useState<'mes' | 'todo'>('mes');
  const range = periodRange(period);
  const commissions = useAsync(() => fetchCommissions(range.from, range.to), [period]);
  const mine = rows.filter((r) => !me || r.lead.sdr_id === me);
  const myCalls = calls.filter((c) => !me || c.sdr_id === me);
  const live = myCalls.filter((c) => c.status !== 'cancelada');
  const contacted = mine.filter((r) => r.contact_attempts > 0);
  const answered = mine.filter((r) => r.answered);
  const booked = mine.filter((r) => r.agendo === true);
  const shows = live.filter((c) => c.attendance === 'se_presento');
  const sales = live.filter((c) => c.result === 'cerro');
  const real = realNumbers({ dials: mine.reduce((s, r) => s + r.contact_attempts, 0), answered: answered.length, contacted: contacted.length, booked: booked.length, calls: live });

  return (
    <>
      <div className="filters">
        <div className="seg">
          <button type="button" className={`seg__opt${period === 'mes' ? ' is-on' : ''}`} onClick={() => setPeriod('mes')}>Este mes</button>
          <button type="button" className={`seg__opt${period === 'todo' ? ' is-on' : ''}`} onClick={() => setPeriod('todo')}>Todo</button>
        </div>
      </div>
      <State loading={commissions.loading} error={commissions.error}>
        <CommissionCards rows={(commissions.data ?? []).filter((c) => c.role === 'sdr' && (!me || c.rep_id === me))} pct={pct} />
      </State>
      <h2 className="section-title">Resultados de tus agendas</h2>
      <div className="kpis kpis--4">
        <Kpi label="Leads" value={mine.length} hint={`${contacted.length} contactados`} />
        <Kpi label="Contestaron" value={answered.length} hint={contacted.length ? `${Math.round((answered.length / contacted.length) * 100)}% de los contactados` : undefined} />
        <Kpi label="Agendaste" value={booked.length} />
        <Kpi label="Se presentaron" value={shows.length} hint={live.filter((c) => c.attendance).length ? `${Math.round((shows.length / live.filter((c) => c.attendance).length) * 100)}% show-up` : undefined} />
        <Kpi label="Ventas" value={sales.length} tone="ok" hint={fmtMoney(sales.reduce((s, c) => s + Number(c.amount_total ?? 0), 0), 'USD')} />
      </div>
      <Simulator mode="sdr" real={real} pct={pct} />
    </>
  );
}
