import { useState } from 'react';
import { Field } from '../admin/ui';
import type { SalesReport } from '../lib/types';
import { PAINS } from '../funnels/api';
import { saveReport, type ReportInput } from './api';

const KEYS: (keyof ReportInput)[] = ['first_touch', 'last_touch', 'entry_quote', 'pain', 'pain_quote', 'beliefs', 'buy_reason', 'no_close_reason', 'objections', 'lane', 'goes_to'];

/** Borrador del reporte a partir del que ya existe (o vacío). */
export const reportDraft = (r?: SalesReport | null): ReportInput =>
  Object.fromEntries(KEYS.map((k) => [k, r?.[k] ?? (k === 'goes_to' ? '' : null)])) as ReportInput;

export type CallOutcome = 'cerro' | 'no_cerro' | 'seguimiento';

/** Qué le falta al reporte para poder cerrar la llamada con ese resultado (lo mismo que valida la base). */
export function reportMissing(r: ReportInput, outcome: CallOutcome): string | null {
  if (outcome === 'cerro' && !r.buy_reason?.trim()) return 'En el reporte falta por qué compró (textual).';
  if (outcome === 'no_cerro' && !r.no_close_reason?.trim()) return 'En el reporte falta por qué no cerró (textual).';
  if (outcome !== 'seguimiento' && !r.goes_to?.trim()) return 'En el reporte falta a qué pieza va cada dato.';
  if (outcome === 'cerro' && !r.lane) return 'En el reporte falta el carril (OS o Lite).';
  return null;
}

/**
 * Campos del reporte por fases (SOP 04). `phases` elige qué se muestra: el setter carga 1 y 2
 * antes de la llamada; el closer completa la 3 al cerrar.
 */
export function ReportFields({ value, onChange, phases = [1, 2, 3], outcome }: { value: ReportInput; onChange: (v: ReportInput) => void; phases?: (1 | 2 | 3)[]; outcome?: CallOutcome }) {
  const set = <K extends keyof ReportInput>(k: K, v: ReportInput[K]) => onChange({ ...value, [k]: v });
  const text = (k: 'first_touch' | 'last_touch' | 'entry_quote' | 'pain_quote' | 'beliefs' | 'buy_reason' | 'no_close_reason' | 'objections' | 'goes_to', rows = 2, placeholder?: string) => (
    <textarea className="field field--area rfield" rows={rows} value={value[k] ?? ''} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />
  );
  return (
    <>
      {phases.includes(1) && (
        <>
          <h4 className="rphase afield--full">Fase 1 · Antes de la llamada</h4>
          <Field label="Primer contacto (pieza o canal)">{text('first_touch', 1, 'Ej: reel «7 lucas de ganancia»')}</Field>
          <Field label="Último contacto antes de la llamada">{text('last_touch', 1, 'Ej: video de la pizarra')}</Field>
          <Field label="Cómo llegó, con sus palabras" full>{text('entry_quote')}</Field>
        </>
      )}
      {phases.includes(2) && (
        <>
          <h4 className="rphase afield--full">Fase 2 · Triage / setting</h4>
          <Field label="Dolor del mapa">
            <select className="field field--select" value={value.pain ?? ''} onChange={(e) => set('pain', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Sin definir</option>
              {PAINS.map((p) => <option key={p} value={p}>Dolor {p}</option>)}
            </select>
          </Field>
          <Field label="Creencias que trajo">{text('beliefs', 1, 'Ej: «en Argentina no se suscribe nadie»')}</Field>
          <Field label="El dolor, textual" full>{text('pain_quote', 2, 'Con las palabras del lead, sin resumir')}</Field>
        </>
      )}
      {phases.includes(3) && (
        <>
          <h4 className="rphase afield--full">Fase 3 · Después de la llamada</h4>
          {outcome !== 'no_cerro' && <Field label={`Por qué compró (textual)${outcome === 'cerro' ? ' *' : ''}`} full>{text('buy_reason')}</Field>}
          {outcome !== 'cerro' && <Field label={`Por qué no cerró (textual)${outcome === 'no_cerro' ? ' *' : ''}`} full>{text('no_close_reason')}</Field>}
          <Field label="Objeciones (textuales)" full>{text('objections')}</Field>
          <Field label={`Carril${outcome === 'cerro' ? ' *' : ''}`}>
            <select className="field field--select" value={value.lane ?? ''} onChange={(e) => set('lane', (e.target.value || null) as ReportInput['lane'])}>
              <option value="">Sin definir</option>
              <option value="os">Genesis OS</option>
              {/* Lite es interno: solo aparece acá, en el carril de la llamada. */}
              <option value="lite">Genesis Lite (interno)</option>
              <option value="ninguno">Ninguno</option>
            </select>
          </Field>
          <Field label={`A qué pieza va cada dato${outcome && outcome !== 'seguimiento' ? ' *' : ''}`} full>{text('goes_to', 2, 'Ej: la frase del dolor → reel del lunes; la objeción → historia del domingo')}</Field>
        </>
      )}
    </>
  );
}

/** Reporte en modo lectura. */
export function ReportView({ report }: { report: SalesReport }) {
  const rows: [string, string | number | null][] = [
    ['Primer contacto', report.first_touch],
    ['Último contacto', report.last_touch],
    ['Cómo llegó', report.entry_quote],
    ['Dolor', report.pain ? `Dolor ${report.pain}` : null],
    ['El dolor, textual', report.pain_quote],
    ['Creencias', report.beliefs],
    ['Por qué compró', report.buy_reason],
    ['Por qué no cerró', report.no_close_reason],
    ['Objeciones', report.objections],
    ['Carril', report.lane === 'os' ? 'Genesis OS' : report.lane === 'lite' ? 'Genesis Lite' : report.lane === 'ninguno' ? 'Ninguno' : null],
    ['A qué pieza va', report.goes_to || null],
  ];
  return (
    <dl className="rview">
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

/** Editor suelto del reporte (ficha del lead, lista de reportes): guarda con crm_save_report. */
export function ReportEditor({ leadLaunchId, callId, report, phases, onSaved }: { leadLaunchId: string; callId: string | null; report: SalesReport | null; phases?: (1 | 2 | 3)[]; onSaved: () => void }) {
  const [draft, setDraft] = useState<ReportInput>(() => reportDraft(report));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      // Solo los campos de las fases que se muestran: no pisa lo que cargó otro.
      const shown = (phases ?? [1, 2, 3]).flatMap((p) => (p === 1 ? ['first_touch', 'last_touch', 'entry_quote'] : p === 2 ? ['pain', 'pain_quote', 'beliefs'] : ['buy_reason', 'no_close_reason', 'objections', 'lane', 'goes_to']));
      await saveReport(leadLaunchId, callId, Object.fromEntries(Object.entries(draft).filter(([k]) => shown.includes(k))) as ReportInput);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="aform">
      <ReportFields value={draft} onChange={(v) => { setSaved(false); setDraft(v); }} phases={phases} />
      {error && <p className="login__error afield--full">{error}</p>}
      <div className="aform__actions afield--full">
        {saved && <span className="muted" style={{ marginRight: 'auto' }}>Guardado ✓</span>}
        <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar reporte'}</button>
      </div>
    </div>
  );
}
