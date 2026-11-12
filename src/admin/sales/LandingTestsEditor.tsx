import { useState, type FormEvent } from 'react';
import { supabase, unwrap } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { fmtDateTime } from '../../lib/format';
import { Field, Modal, Pill, State } from '../ui';
import { isoToLocal, localToIso } from '../../crm/api';

interface TestRow { id: string; nombre: string; descripcion: string; tipo: 'test' | 'landing'; starts_at: string; ends_at: string | null; stable_from: string | null }
interface VariantRow { test_id: string; code: string; nombre: string; titular_key: string; titular: string; bajada: string; orden_key: string; orden: string; sort: number; retired_at: string | null }
interface EventRow { id?: string; test_id: string; at: string; until: string | null; descripcion: string; variants: string[] | null }

const load = async () => {
  const [tests, variants, events] = await Promise.all([
    supabase.from('landing_tests').select('*').order('starts_at', { ascending: false }),
    supabase.from('landing_test_variants').select('*').order('sort'),
    supabase.from('landing_test_events').select('*').order('at'),
  ]);
  return { tests: unwrap(tests) as TestRow[], variants: unwrap(variants) as VariantRow[], events: unwrap(events) as EventRow[] };
};

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** Config. CRM → Tests de landing: crear un test, cargar sus versiones y eventos, y cerrarlo. */
export default function LandingTestsEditor() {
  const { data, loading, error, reload } = useAsync(load, []);
  const [editing, setEditing] = useState<TestRow | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const close = async (t: TestRow) => {
    if (!window.confirm(`¿Cerrar «${t.nombre}» ahora? Desde este momento pasa al historial.`)) return;
    setBusy(true);
    try {
      unwrap(await supabase.from('landing_tests').update({ ends_at: new Date().toISOString() }).eq('id', t.id));
      reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section style={{ marginBottom: 28 }}>
      <div className="toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Tests de landing</h2>
        <div className="toolbar__right"><button className="btn btn--primary" onClick={() => setEditing('new')}>+ Nuevo test</button></div>
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Cada versión se identifica por el código que manda la landing en <code>tracking.ab</code>. Si el mismo código se usó en varios tests, cada visita va al test que estaba activo en ese momento.
      </p>
      <State loading={loading} error={error}>
        {data && (
          <div className="glass table-wrap">
            <table className="table">
              <thead><tr><th>Test</th><th>Desde</th><th>Hasta</th><th>Versiones</th><th></th></tr></thead>
              <tbody>
                {data.tests.map((t) => (
                  <tr key={t.id} className="table__row" onClick={() => setEditing(t)}>
                    <td><div className="cell-main">{t.nombre} {t.tipo === 'landing' ? <Pill tone="muted">Landings</Pill> : !t.ends_at && <Pill tone="accent">Abierto</Pill>}</div><div className="cell-sub">{t.id}</div></td>
                    <td>{fmtDateTime(t.starts_at)}</td>
                    <td>{t.ends_at ? fmtDateTime(t.ends_at) : <span className="muted">—</span>}</td>
                    <td>{data.variants.filter((v) => v.test_id === t.id).map((v) => v.code).join(', ')}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {t.tipo === 'test' && !t.ends_at && <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => close(t)}>Cerrar test</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </State>
      {editing && data && (
        <TestModal
          test={editing === 'new' ? null : editing}
          variants={editing === 'new' ? [] : data.variants.filter((v) => v.test_id === editing.id)}
          events={editing === 'new' ? [] : data.events.filter((e) => e.test_id === editing.id)}
          taken={data.tests.map((t) => t.id)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </section>
  );
}

function TestModal({ test, variants, events, taken, onClose, onSaved }: {
  test: TestRow | null; variants: VariantRow[]; events: EventRow[]; taken: string[]; onClose: () => void; onSaved: () => void;
}) {
  const [v, setV] = useState({
    nombre: test?.nombre ?? '', descripcion: test?.descripcion ?? '', tipo: test?.tipo ?? ('test' as const),
    inicio: isoToLocal(test?.starts_at ?? new Date().toISOString()), fin: isoToLocal(test?.ends_at ?? null), estable: isoToLocal(test?.stable_from ?? null),
  });
  const [vars, setVars] = useState(variants.map((x) => ({ ...x, salio: isoToLocal(x.retired_at) })));
  const [evs, setEvs] = useState(events.map((e) => ({ ...e, at: isoToLocal(e.at), until: isoToLocal(e.until), vs: (e.variants ?? []).join(', ') })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.nombre.trim()) return setError('Poné un nombre.');
    if (!v.inicio) return setError('Falta la fecha de inicio.');
    const codes = vars.map((x) => x.code.trim());
    if (codes.some((c) => !c)) return setError('Todas las versiones necesitan su código.');
    if (new Set(codes).size !== codes.length) return setError('Hay códigos repetidos.');
    setBusy(true);
    setError(null);
    try {
      let id = test?.id ?? slug(`${v.nombre}-${v.inicio.slice(0, 10)}`);
      if (!test) for (let i = 2; taken.includes(id); i++) id = `${slug(v.nombre)}-${i}`;
      const row = {
        id, nombre: v.nombre.trim(), descripcion: v.descripcion.trim(), tipo: v.tipo,
        starts_at: localToIso(v.inicio), ends_at: localToIso(v.fin), stable_from: localToIso(v.estable),
      };
      unwrap(await supabase.from('landing_tests').upsert(row));
      // Versiones: se guardan las de la lista y se borran las que se sacaron.
      const removed = variants.filter((x) => !codes.includes(x.code)).map((x) => x.code);
      if (removed.length) unwrap(await supabase.from('landing_test_variants').delete().eq('test_id', id).in('code', removed));
      if (vars.length) unwrap(await supabase.from('landing_test_variants').upsert(vars.map((x, i) => ({
        test_id: id, code: x.code.trim(), nombre: x.nombre.trim() || x.code.trim(), titular_key: x.titular_key.trim(), titular: x.titular.trim(),
        bajada: x.bajada.trim(), orden_key: x.orden_key.trim(), orden: x.orden.trim(), sort: i + 1, retired_at: localToIso(x.salio),
      }))));
      // Eventos: se reemplazan todos.
      if (test) unwrap(await supabase.from('landing_test_events').delete().eq('test_id', id));
      const evRows = evs.filter((x) => x.at && x.descripcion.trim()).map((x) => ({
        test_id: id, at: localToIso(x.at), until: localToIso(x.until ?? ''), descripcion: x.descripcion.trim(),
        variants: x.vs.trim() ? x.vs.split(',').map((s) => s.trim()).filter(Boolean) : null,
      }));
      if (evRows.length) unwrap(await supabase.from('landing_test_events').insert(evRows));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!test || !window.confirm(`¿Borrar «${test.nombre}»? Se borran sus versiones y eventos (las visitas y los registros no se tocan: pasan a «sin test»).`)) return;
    setBusy(true);
    try {
      unwrap(await supabase.from('landing_tests').delete().eq('id', test.id));
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const setVar = (i: number, k: keyof VariantRow | 'salio', val: string) => setVars((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: val } : x)));

  return (
    <Modal title={test ? `Editar · ${test.nombre}` : 'Nuevo test de landing'} onClose={onClose} wide>
      <form className="aform" onSubmit={submit}>
        <Field label="Nombre" full><input className="field" value={v.nombre} onChange={(e) => setV((s) => ({ ...s, nombre: e.target.value }))} placeholder="Ej: Titular × orden (20/11)" autoFocus={!test} /></Field>
        <Field label="Descripción" full><textarea className="field field--area" rows={2} value={v.descripcion} onChange={(e) => setV((s) => ({ ...s, descripcion: e.target.value }))} /></Field>
        <Field label="Tipo">
          <select className="field field--select" value={v.tipo} onChange={(e) => setV((s) => ({ ...s, tipo: e.target.value as 'test' | 'landing' }))}>
            <option value="test">Test (tiene ganador)</option>
            <option value="landing">Landings sueltas (sin ganador)</option>
          </select>
        </Field>
        <Field label="Empieza"><input className="field" type="datetime-local" value={v.inicio} onChange={(e) => setV((s) => ({ ...s, inicio: e.target.value }))} /></Field>
        <Field label="Termina (vacío = abierto)"><input className="field" type="datetime-local" value={v.fin} onChange={(e) => setV((s) => ({ ...s, fin: e.target.value }))} /></Field>
        <Field label="Página estable desde (opcional)"><input className="field" type="datetime-local" value={v.estable} onChange={(e) => setV((s) => ({ ...s, estable: e.target.value }))} /></Field>

        <div className="afield--full">
          <span className="afield__label">Versiones</span>
          <div className="lte__list">
            {vars.map((x, i) => (
              <div key={i} className="lte__row">
                <input className="field lte__code" value={x.code} onChange={(e) => setVar(i, 'code', e.target.value)} placeholder="Código (ab)" aria-label="Código" />
                <input className="field" value={x.nombre} onChange={(e) => setVar(i, 'nombre', e.target.value)} placeholder="Nombre legible" aria-label="Nombre" />
                <input className="field lte__key" value={x.titular_key} onChange={(e) => setVar(i, 'titular_key', e.target.value)} placeholder="Titular (a, b…)" aria-label="Clave del titular" />
                <input className="field" value={x.titular} onChange={(e) => setVar(i, 'titular', e.target.value)} placeholder="Texto del titular" aria-label="Titular" />
                <input className="field lte__key" value={x.orden_key} onChange={(e) => setVar(i, 'orden_key', e.target.value)} placeholder="Orden (1, 2…)" aria-label="Clave del orden" />
                <input className="field" value={x.orden} onChange={(e) => setVar(i, 'orden', e.target.value)} placeholder="Qué es ese orden" aria-label="Orden" />
                <input className="field" type="datetime-local" value={x.salio} onChange={(e) => setVar(i, 'salio', e.target.value)} title="Salió del test (vacío = sigue)" aria-label="Salió del test" />
                <button type="button" className="icon-btn" onClick={() => setVars((xs) => xs.filter((_, j) => j !== i))} aria-label="Quitar versión">✕</button>
              </div>
            ))}
          </div>
          <p className="muted" style={{ margin: '4px 0', fontSize: 12 }}>La última columna es desde cuándo la versión salió del test (vacía = sigue).</p>
          <button type="button" className="link link--btn" onClick={() => setVars((xs) => [...xs, { test_id: test?.id ?? '', code: '', nombre: '', titular_key: '', titular: '', bajada: '', orden_key: '', orden: '', sort: xs.length + 1, retired_at: null, salio: '' }])}>+ Versión</button>
        </div>

        <div className="afield--full">
          <span className="afield__label">Cambios durante el test (se marcan en los gráficos)</span>
          <div className="lte__list">
            {evs.map((x, i) => (
              <div key={i} className="lte__row lte__row--ev">
                <input className="field" type="datetime-local" value={x.at} onChange={(e) => setEvs((xs) => xs.map((y, j) => (j === i ? { ...y, at: e.target.value } : y)))} aria-label="Cuándo" />
                <input className="field" value={x.descripcion} onChange={(e) => setEvs((xs) => xs.map((y, j) => (j === i ? { ...y, descripcion: e.target.value } : y)))} placeholder="Qué cambió" aria-label="Qué cambió" />
                <input className="field lte__key" value={x.vs} onChange={(e) => setEvs((xs) => xs.map((y, j) => (j === i ? { ...y, vs: e.target.value } : y)))} placeholder="Versiones (vacío = todas)" aria-label="Versiones" />
                <button type="button" className="icon-btn" onClick={() => setEvs((xs) => xs.filter((_, j) => j !== i))} aria-label="Quitar cambio">✕</button>
              </div>
            ))}
          </div>
          <button type="button" className="link link--btn" onClick={() => setEvs((xs) => [...xs, { test_id: test?.id ?? '', at: isoToLocal(new Date().toISOString()), until: '', descripcion: '', variants: null, vs: '' }])}>+ Cambio</button>
        </div>

        {error && <p className="login__error afield--full">{error}</p>}
        <div className="aform__actions afield--full">
          {test && <button type="button" className="btn btn--danger" disabled={busy} onClick={remove}>Borrar test</button>}
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
