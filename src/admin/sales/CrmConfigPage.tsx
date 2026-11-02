import { useState, type FormEvent } from 'react';
import { supabase, unwrap } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { fmtDate, fmtMoney } from '../../lib/format';
import { Field, Modal, Pill, State } from '../ui';
import { fetchAgents, fetchLaunches, fetchResources, fetchSettings } from '../../crm/api';
import type { CrmAgent, CrmResource, CrmSettings, Launch } from '../../lib/types';

const load = () => Promise.all([fetchSettings(), fetchLaunches(), fetchAgents(), fetchResources()]);

export default function CrmConfigPage() {
  const { data, loading, error, reload } = useAsync(load, []);
  const [settings, launches = [], agents = [], resources = []] = data ?? [];
  return (
    <State loading={loading} error={error}>
      {settings && <Distribution settings={settings} onSaved={reload} />}
      <Launches launches={launches} onSaved={reload} />
      <Agents agents={agents} onSaved={reload} />
      <Resources resources={resources} onSaved={reload} />
    </State>
  );
}

function useSaver(onSaved: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after?.();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function Distribution({ settings, onSaved }: { settings: CrmSettings; onSaved: () => void }) {
  const [sdrPct, setSdrPct] = useState(String(settings.sdr_commission_pct));
  const [closerPct, setCloserPct] = useState(String(settings.closer_commission_pct));
  const { busy, error, run } = useSaver(onSaved);
  const save = (patch: Partial<CrmSettings>) =>
    run(async () => unwrap(await supabase.from('crm_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', true)));

  return (
    <section className="glass panel" style={{ marginBottom: 28 }}>
      <h2 className="panel__title">Reparto y comisiones</h2>
      <div className="filters">
        <span className="afield__label">Reparto de leads</span>
        <div className="seg">
          <button type="button" className={`seg__opt${settings.assignment_mode === 'bolsa' ? ' is-on' : ''}`} disabled={busy} onClick={() => save({ assignment_mode: 'bolsa' })}>Bolsa</button>
          <button type="button" className={`seg__opt${settings.assignment_mode === 'ronda' ? ' is-on' : ''}`} disabled={busy} onClick={() => save({ assignment_mode: 'ronda' })}>Ronda automática</button>
        </div>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {settings.assignment_mode === 'bolsa'
          ? 'Bolsa: los leads entran sin SDR y cada SDR toma los que va a trabajar desde "Por asignar".'
          : 'Ronda: los calificados se asignan solos al registrarse y el resto al aplicar, entre los SDR activos según su peso.'}
      </p>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); save({ sdr_commission_pct: Number(sdrPct), closer_commission_pct: Number(closerPct) }); }}>
        <label className="afield"><span className="afield__label">Comisión SDR (% por venta que agendó)</span><input className="field field--num" type="number" min="0" max="100" step="0.1" value={sdrPct} onChange={(e) => setSdrPct(e.target.value)} /></label>
        <label className="afield"><span className="afield__label">Comisión closer (% de sus ventas)</span><input className="field field--num" type="number" min="0" max="100" step="0.1" value={closerPct} onChange={(e) => setCloserPct(e.target.value)} /></label>
        <button className="btn btn--primary" disabled={busy || (Number(sdrPct) === Number(settings.sdr_commission_pct) && Number(closerPct) === Number(settings.closer_commission_pct))}>Guardar comisiones</button>
      </form>
      <p className="muted" style={{ margin: 0 }}>Se calculan sobre el cash cobrado; las cuotas que faltan cobrar se muestran como pendiente.</p>
      {error && <p className="state--error">{error}</p>}
    </section>
  );
}

function Launches({ launches, onSaved }: { launches: Launch[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<Launch | 'new' | null>(null);
  const { busy, error, run } = useSaver(onSaved);
  const makeCurrent = (id: string) =>
    run(async () => {
      unwrap(await supabase.from('launches').update({ is_current: false }).eq('is_current', true));
      unwrap(await supabase.from('launches').update({ is_current: true }).eq('id', id));
    });

  return (
    <section style={{ marginBottom: 28 }}>
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Lanzamientos</h2>
        <div className="toolbar__right"><button className="btn btn--primary" onClick={() => setEditing('new')}>+ Nuevo lanzamiento</button></div>
      </div>
      <div className="glass table-wrap">
        <table className="table">
          <thead><tr><th>Lanzamiento</th><th>Clase</th><th>Meta</th><th>Meta diaria</th><th>Cierre de ventas</th><th></th></tr></thead>
          <tbody>
            {launches.map((l) => (
              <tr key={l.id} className="table__row" onClick={() => setEditing(l)}>
                <td><div className="cell-main">{l.name} {l.is_current && <Pill tone="accent">Actual</Pill>}</div><div className="cell-sub">{l.id}</div></td>
                <td>{fmtDate(l.starts_at)}</td>
                <td>{l.cash_goal ? fmtMoney(Number(l.cash_goal), 'USD') : <Pill tone="warn">Sin meta</Pill>}</td>
                <td>{l.daily_cash_goal ? fmtMoney(Number(l.daily_cash_goal), 'USD') : '—'}</td>
                <td>{fmtDate(l.sales_close_at)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {!l.is_current && <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => window.confirm(`Los eventos nuevos de la landing van a entrar a "${l.name}". ¿Seguro?`) && makeCurrent(l.id)}>Marcar como actual</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="state--error">{error}</p>}
      {editing && <LaunchModal launch={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onSaved(); }} />}
    </section>
  );
}

function LaunchModal({ launch, onClose, onSaved }: { launch: Launch | null; onClose: () => void; onSaved: () => void }) {
  const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  const [v, setV] = useState({
    id: launch?.id ?? '',
    name: launch?.name ?? '',
    starts_at: local(launch?.starts_at ?? null),
    cash_goal: launch?.cash_goal != null ? String(launch.cash_goal) : '',
    daily_cash_goal: launch?.daily_cash_goal != null ? String(launch.daily_cash_goal) : '',
    sales_close_at: launch?.sales_close_at ?? '',
  });
  const { busy, error, run } = useSaver(onSaved);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const row = {
      name: v.name.trim(),
      starts_at: v.starts_at ? new Date(v.starts_at).toISOString() : null,
      cash_goal: v.cash_goal ? Number(v.cash_goal) : null,
      daily_cash_goal: v.daily_cash_goal ? Number(v.daily_cash_goal) : null,
      sales_close_at: v.sales_close_at || null,
    };
    run(async () => {
      if (!row.name) throw new Error('Falta el nombre.');
      if (launch) unwrap(await supabase.from('launches').update(row).eq('id', launch.id));
      else {
        if (!/^[a-z0-9-]+$/.test(v.id)) throw new Error('El identificador va en minúsculas, números y guiones (ej: clase-01-12).');
        unwrap(await supabase.from('launches').insert({ ...row, id: v.id }));
      }
    });
  };
  return (
    <Modal title={launch ? `Editar · ${launch.name}` : 'Nuevo lanzamiento'} onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Identificador"><input className="field" value={v.id} onChange={set('id')} disabled={Boolean(launch)} placeholder="clase-01-12" /></Field>
        <Field label="Nombre"><input className="field" value={v.name} onChange={set('name')} placeholder="Clase martes 01/12 · 18 hs" /></Field>
        <Field label="Fecha y hora de la clase"><input className="field" type="datetime-local" value={v.starts_at} onChange={set('starts_at')} /></Field>
        <Field label="Cierre de ventas"><input className="field" type="date" value={v.sales_close_at} onChange={set('sales_close_at')} /></Field>
        <Field label="Meta de cash (USD)"><input className="field" type="number" min="0" value={v.cash_goal} onChange={set('cash_goal')} /></Field>
        <Field label="Meta diaria (USD)"><input className="field" type="number" min="0" value={v.daily_cash_goal} onChange={set('daily_cash_goal')} /></Field>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={busy}>Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function Agents({ agents, onSaved }: { agents: CrmAgent[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<CrmAgent | 'new' | null>(null);
  return (
    <section style={{ marginBottom: 28 }}>
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Agentes de IA · {agents.length}</h2>
        <div className="toolbar__right"><button className="btn btn--primary" onClick={() => setEditing('new')}>+ Nuevo agente</button></div>
      </div>
      <p className="muted">El SDR elige hasta 3 según el caso del lead y se los manda por WhatsApp.</p>
      <div className="agent-grid">
        {agents.map((a) => (
          <button key={a.id} type="button" className={`agent${a.active ? '' : ' is-off'}`} onClick={() => setEditing(a)}>
            <strong>{a.name}</strong>
            <small>{a.description || 'Sin descripción'}</small>
            {!a.active && <Pill tone="muted">Oculto</Pill>}
          </button>
        ))}
        {agents.length === 0 && <p className="muted">Todavía no hay agentes cargados.</p>}
      </div>
      {editing && <AgentModal agent={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onSaved(); }} />}
    </section>
  );
}

function AgentModal({ agent, onClose, onSaved }: { agent: CrmAgent | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: agent?.name ?? '', description: agent?.description ?? '', message: agent?.message ?? '', sort: agent?.sort ?? 0, active: agent?.active ?? true });
  const { busy, error, run } = useSaver(onSaved);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!v.name.trim()) throw new Error('Falta el nombre.');
      if (agent) unwrap(await supabase.from('crm_agents').update(v).eq('id', agent.id));
      else unwrap(await supabase.from('crm_agents').insert(v));
    });
  };
  const remove = () => agent && window.confirm(`¿Eliminar el agente "${agent.name}"?`) && run(async () => unwrap(await supabase.from('crm_agents').delete().eq('id', agent.id)));
  return (
    <Modal title={agent ? `Editar · ${agent.name}` : 'Nuevo agente'} onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Nombre" full><input className="field" value={v.name} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} /></Field>
        <Field label="Para qué sirve (lo ve el SDR)" full><input className="field" value={v.description} onChange={(e) => setV((s) => ({ ...s, description: e.target.value }))} /></Field>
        <Field label="Texto para el mensaje (link, cómo usarlo…)" full><textarea className="field field--area" rows={4} value={v.message} onChange={(e) => setV((s) => ({ ...s, message: e.target.value }))} /></Field>
        <Field label="Orden"><input className="field" type="number" value={v.sort} onChange={(e) => setV((s) => ({ ...s, sort: Number(e.target.value) }))} /></Field>
        <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={v.active} onChange={(e) => setV((s) => ({ ...s, active: e.target.checked }))} /> Visible para el equipo</label>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          {agent && <button type="button" className="btn btn--danger" onClick={remove}>Eliminar</button>}
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={busy}>Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function Resources({ resources, onSaved }: { resources: CrmResource[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<CrmResource | 'new' | null>(null);
  return (
    <section>
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Recursos · {resources.length}</h2>
        <div className="toolbar__right"><button className="btn btn--primary" onClick={() => setEditing('new')}>+ Nuevo recurso</button></div>
      </div>
      <div className="glass table-wrap">
        <table className="table">
          <thead><tr><th>Recurso</th><th>Tipo</th><th>Para</th><th>Estado</th></tr></thead>
          <tbody>
            {resources.map((r) => (
              <tr key={r.id} className="table__row" onClick={() => setEditing(r)}>
                <td>{r.title}</td>
                <td>{r.kind === 'link' ? 'Link' : 'Guion'}</td>
                <td>{r.audience === 'todos' ? 'Todo el equipo' : r.audience === 'sdr' ? 'SDRs' : 'Closers'}</td>
                <td>{r.active ? <Pill tone="ok">Visible</Pill> : <Pill tone="muted">Oculto</Pill>}</td>
              </tr>
            ))}
            {resources.length === 0 && <tr><td colSpan={4} className="muted">Todavía no hay recursos.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <ResourceModal resource={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onSaved(); }} />}
    </section>
  );
}

function ResourceModal({ resource, onClose, onSaved }: { resource: CrmResource | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    title: resource?.title ?? '',
    kind: resource?.kind ?? ('link' as CrmResource['kind']),
    url: resource?.url ?? '',
    body: resource?.body ?? '',
    audience: resource?.audience ?? ('todos' as CrmResource['audience']),
    sort: resource?.sort ?? 0,
    active: resource?.active ?? true,
  });
  const { busy, error, run } = useSaver(onSaved);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!v.title.trim()) throw new Error('Falta el título.');
      const row = { ...v, url: v.kind === 'link' ? v.url.trim() || null : null, body: v.kind === 'guion' ? v.body : null };
      if (resource) unwrap(await supabase.from('crm_resources').update(row).eq('id', resource.id));
      else unwrap(await supabase.from('crm_resources').insert(row));
    });
  };
  const remove = () => resource && window.confirm(`¿Eliminar "${resource.title}"?`) && run(async () => unwrap(await supabase.from('crm_resources').delete().eq('id', resource.id)));
  return (
    <Modal title={resource ? `Editar · ${resource.title}` : 'Nuevo recurso'} onClose={onClose}>
      <form className="aform" onSubmit={submit}>
        <Field label="Título" full><input className="field" value={v.title} onChange={(e) => setV((s) => ({ ...s, title: e.target.value }))} /></Field>
        <Field label="Tipo">
          <select className="field field--select" value={v.kind} onChange={(e) => setV((s) => ({ ...s, kind: e.target.value as CrmResource['kind'] }))}>
            <option value="link">Link</option>
            <option value="guion">Guion (texto para copiar)</option>
          </select>
        </Field>
        <Field label="Para">
          <select className="field field--select" value={v.audience} onChange={(e) => setV((s) => ({ ...s, audience: e.target.value as CrmResource['audience'] }))}>
            <option value="todos">Todo el equipo</option>
            <option value="sdr">SDRs</option>
            <option value="closer">Closers</option>
          </select>
        </Field>
        {v.kind === 'link' ? (
          <Field label="URL" full><input className="field" type="url" value={v.url} onChange={(e) => setV((s) => ({ ...s, url: e.target.value }))} /></Field>
        ) : (
          <Field label="Guion" full><textarea className="field field--area" rows={8} value={v.body} onChange={(e) => setV((s) => ({ ...s, body: e.target.value }))} /></Field>
        )}
        <Field label="Orden"><input className="field" type="number" value={v.sort} onChange={(e) => setV((s) => ({ ...s, sort: Number(e.target.value) }))} /></Field>
        <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={v.active} onChange={(e) => setV((s) => ({ ...s, active: e.target.checked }))} /> Visible</label>
        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          {resource && <button type="button" className="btn btn--danger" onClick={remove}>Eliminar</button>}
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={busy}>Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
