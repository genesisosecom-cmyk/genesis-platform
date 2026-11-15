import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import FullScreenMessage from '../components/FullScreenMessage';
import { fetchMyContext, fetchMyOnboarding, saveOnboarding } from '../onboarding/api';
import {
  isFilled,
  validateStep,
  visibleQuestions,
  visibleSteps,
  type Answer,
  type Answers,
  type OnbQuestion,
  type Person,
} from '../onboarding/questions';

type Save = 'idle' | 'saving' | 'saved' | 'error';

export default function OnboardingPage() {
  const { profile } = useAuth();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [answers, setAnswers] = useState<Answers>({});
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [save, setSave] = useState<Save>('idle');
  const [sending, setSending] = useState(false);
  const dirty = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Carga lo que ya respondió y completa nombre, teléfono y programa con su ficha de cliente.
  useEffect(() => {
    if (!profile) return;
    Promise.all([fetchMyOnboarding(profile.id), fetchMyContext()])
      .then(([row, ctx]) => {
        const a: Answers = { ...(row?.answers ?? {}) };
        if (!isFilled(a.nombre) && (ctx?.full_name || profile.full_name)) a.nombre = ctx?.full_name || profile.full_name;
        if (!isFilled(a.whatsapp) && ctx?.phone) a.whatsapp = ctx.phone;
        if (!isFilled(a.programa) && ctx?.program) a.programa = ctx.program;
        setAnswers(a);
        setIndex(row?.step ?? 0);
        setDone(Boolean(row?.completed_at));
        setReady(true);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [profile]);

  const steps = useMemo(() => visibleSteps(answers), [answers]);
  const i = Math.min(index, steps.length - 1);
  const step = steps[i];
  const isLast = i === steps.length - 1;
  const percent = Math.round(((i + 1) / steps.length) * 100);

  // Autoguardado: un segundo después de dejar de escribir.
  useEffect(() => {
    if (!ready || !dirty.current) return;
    setSave('saving');
    const t = setTimeout(() => {
      saveOnboarding(answers, i)
        .then(() => setSave('saved'))
        .catch(() => setSave('error'));
    }, 1000);
    return () => clearTimeout(t);
  }, [answers, i, ready]);

  const set = (id: string, v: Answer) => {
    dirty.current = true;
    setError('');
    setAnswers((a) => ({ ...a, [id]: v }));
  };

  const goTo = (n: number) => {
    dirty.current = true;
    setError('');
    setIndex(n);
    requestAnimationFrame(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const next = async () => {
    const msg = validateStep(step, answers);
    if (msg) return setError(msg);
    if (!isLast) return goTo(i + 1);
    setSending(true);
    try {
      await saveOnboarding(answers, i, true);
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(`No se pudo enviar: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  if (loadError) return <FullScreenMessage title="No pudimos cargar el formulario" text={loadError} />;
  if (!ready) return <div className="state"><span className="spinner" /></div>;

  return (
    <div className="onb fade-in">
      <header className="onb__intro">
        <span className="eyebrow">Bienvenido a Genesis</span>
        <h1 className="page__title page__title--sm">Contanos sobre vos y tu negocio</h1>
        <p className="page__lead">
          Antes de arrancar necesitamos conocer tu punto de partida mejor que vos. Todo lo que vamos a trabajar con vos (producto, publicidad,
          operación y números) sale de lo que nos pases acá: cuanto más completo, más rápido llegamos a resultados.
        </p>
        <ul className="onb__bullets">
          <li>
            Te va a llevar <strong>entre 30 minutos y 2 horas</strong>. No hace falta hacerlo de una: <strong>tu avance se guarda solo</strong> en tu
            cuenta. Hacé hoy los pasos marcados con <span className="onb__bolt">⚡</span> y el resto en los próximos 3 días.
          </li>
          <li>Todo lo que sea archivo, pasalo como link de Drive (con permiso de lectura).</li>
          <li>
            Si algo no lo tenés, no lo inventes: <strong>poné "no lo tengo"</strong>. Un dato inventado nos hace tomar malas decisiones; un "no sé"
            nos dice dónde ayudarte.
          </li>
        </ul>
      </header>

      {done ? (
        <div className="glass onb__card onb__done">
          <span className="onb__check" aria-hidden="true">✓</span>
          <h2 className="onb__title">¡Listo, gracias!</h2>
          <p className="muted">Tenemos todo lo que necesitamos para arrancar con vos. Te contactamos en breve con los próximos pasos.</p>
          <div className="onb__done-actions">
            <Link to="/" className="btn btn--primary">Ir al campus</Link>
            <button type="button" className="btn btn--ghost" onClick={() => { setDone(false); goTo(0); }}>Revisar o editar mis respuestas</button>
          </div>
        </div>
      ) : (
        <div className="glass onb__card" ref={cardRef}>
          <div className="onb__progress">
            <div className="onb__progress-head">
              <span className="onb__step-n">Paso {i + 1} de {steps.length}</span>
              <span className="muted">
                {save === 'saving' ? 'Guardando…' : save === 'error' ? 'No se pudo guardar, revisá tu conexión' : 'Tu avance se guarda solo'} · {percent}%
              </span>
            </div>
            <div className="onb__bar"><span style={{ width: `${percent}%` }} /></div>
          </div>

          <div className="onb__body" key={step.id}>
            <h2 className="onb__title">
              Paso {i + 1} — {step.title}
              {step.today && <span className="onb__today">⚡ Hacelo hoy</span>}
            </h2>
            {step.subtitle && <p className="muted onb__subtitle">{step.subtitle}</p>}

            {visibleQuestions(step, answers).map((q) => (
              <OnbField key={q.id} q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} />
            ))}

            {error && <p className="login__error">{error}</p>}
            <div className="onb__nav">
              {i > 0 ? <button type="button" className="btn btn--ghost" onClick={() => goTo(i - 1)}>← Atrás</button> : <span />}
              <button type="button" className="btn btn--primary" disabled={sending} onClick={next}>
                {isLast ? (sending ? 'Enviando…' : 'Enviar') : 'Continuar →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OnbField({ q, value, onChange }: { q: OnbQuestion; value: Answer | undefined; onChange: (v: Answer) => void }) {
  const id = `onb-${q.id}`;
  let input;
  if (q.type === 'textarea') {
    input = <textarea id={id} className="field field--area" rows={3} value={String(value ?? '')} placeholder={q.placeholder} onChange={(e) => onChange(e.target.value)} />;
  } else if (q.type === 'dropdown') {
    input = (
      <select id={id} className="field onb__select" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>Seleccioná…</option>
        {q.options?.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (q.type === 'chips') {
    input = (
      <div className="chips" role="radiogroup" aria-labelledby={`${id}-label`}>
        {q.options?.map((o) => (
          <button type="button" key={o} role="radio" aria-checked={value === o} className={`chip${value === o ? ' is-active' : ''}`} onClick={() => onChange(o)}>
            {value === o && '✓ '}{o}
          </button>
        ))}
      </div>
    );
  } else if (q.type === 'multi') {
    const picked = Array.isArray(value) ? (value as string[]) : [];
    const full = q.max !== undefined && picked.length >= q.max;
    input = (
      <>
        <div className="chips" role="group" aria-labelledby={`${id}-label`}>
          {q.options?.map((o) => {
            const on = picked.includes(o);
            return (
              <button
                type="button"
                key={o}
                aria-pressed={on}
                disabled={!on && full}
                className={`chip${on ? ' is-active' : ''}`}
                onClick={() => onChange(on ? picked.filter((x) => x !== o) : [...picked, o])}
              >
                {on && '✓ '}{o}
              </button>
            );
          })}
        </div>
        <p className="onb__hint">{q.max ? `Elegí hasta ${q.max}.` : 'Podés elegir más de una.'}</p>
      </>
    );
  } else if (q.type === 'scale') {
    const min = q.min ?? 1;
    const top = q.top ?? 10;
    input = (
      <>
        <div className="scale onb__scale" role="radiogroup" aria-labelledby={`${id}-label`}>
          {Array.from({ length: top - min + 1 }, (_, k) => min + k).map((n) => (
            <button type="button" key={n} role="radio" aria-checked={value === n} className={`scale__opt${value === n ? ' is-active' : ''}`} onClick={() => onChange(n)}>
              {n}
            </button>
          ))}
        </div>
        {(q.minLabel || q.maxLabel) && <div className="onb__scale-labels"><span>{q.minLabel}</span><span>{q.maxLabel}</span></div>}
      </>
    );
  } else if (q.type === 'people') {
    input = <PeopleField value={Array.isArray(value) ? (value as Person[]) : []} onChange={onChange} />;
  } else {
    input = <input id={id} className="field" value={String(value ?? '')} placeholder={q.placeholder} onChange={(e) => onChange(e.target.value)} />;
  }

  return (
    <div className="onb__q">
      <label htmlFor={id} id={`${id}-label`} className="onb__label">
        {q.label}
        {!q.optional && <span className="q__req">*</span>}
      </label>
      {input}
      {q.help && <p className="onb__hint">{q.help}</p>}
    </div>
  );
}

const EMPTY_PERSON: Person = { role: '', name: '', pay: '', score: '', why: '' };

function PeopleField({ value, onChange }: { value: Person[]; onChange: (v: Person[]) => void }) {
  const people = value.length ? value : [];
  const edit = (k: number, patch: Partial<Person>) => onChange(people.map((p, j) => (j === k ? { ...p, ...patch } : p)));
  return (
    <div className="onb__people">
      {people.map((p, k) => (
        <div key={k} className="onb__person">
          <div className="onb__person-head">
            <strong>Persona #{k + 1}</strong>
            <button type="button" className="link link--btn" onClick={() => onChange(people.filter((_, j) => j !== k))}>Quitar</button>
          </div>
          <div className="onb__person-grid">
            <input className="field" placeholder="Rol (ej: atención, diseño, ads)" value={p.role} onChange={(e) => edit(k, { role: e.target.value })} />
            <input className="field" placeholder="Nombre" value={p.name} onChange={(e) => edit(k, { name: e.target.value })} />
            <input className="field" placeholder="Cómo se le paga" value={p.pay} onChange={(e) => edit(k, { pay: e.target.value })} />
            <input className="field" placeholder="Rendimiento (1 a 10)" inputMode="numeric" value={p.score} onChange={(e) => edit(k, { score: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })} />
          </div>
          <textarea className="field field--area" rows={2} placeholder="¿Por qué le pondrías esa nota?" value={p.why} onChange={(e) => edit(k, { why: e.target.value })} />
        </div>
      ))}
      <button type="button" className="btn btn--ghost onb__add" onClick={() => onChange([...people, { ...EMPTY_PERSON }])}>+ Agregar persona</button>
    </div>
  );
}
