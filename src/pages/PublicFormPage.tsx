import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { ClassSlot, Form, Question } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { isAnswered } from '../forms/QuestionField';
import FullScreenMessage from '../components/FullScreenMessage';
import { PROGRAMS, slotLabel, sortSlots, upcomingDates } from '../data/schedule';

/**
 * Formulario público paso a paso (una pantalla por pregunta) que Manu y José
 * mandan antes de cada clase. No requiere login.
 *
 * - `pre_clase`: ¿Quién sos? → programa → clase y fecha → preguntas (en loop) → enviar.
 * - `custom`:    ¿Quién sos? → cada pregunta configurada en el admin → enviar.
 */

type Step =
  | { kind: 'who' }
  | { kind: 'program' }
  | { kind: 'class' }
  | { kind: 'question'; index: number }
  | { kind: 'more' }
  | { kind: 'custom'; question: Question };

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NO_DATE = 'sin-fecha';
const OTHER_DATE = 'otra';

export default function PublicFormPage() {
  const { slug } = useParams();
  const { session, profile } = useAuth();
  const [form, setForm] = useState<Form | null | undefined>(undefined);
  const [slots, setSlots] = useState<ClassSlot[]>([]);

  const [stage, setStage] = useState<number | 'intro' | 'done'>('intro');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [discord, setDiscord] = useState('');
  const [program, setProgram] = useState('');
  const [slotId, setSlotId] = useState('');
  const [date, setDate] = useState('');
  const [otherDate, setOtherDate] = useState('');
  const [questions, setQuestions] = useState<string[]>(['']);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase
      .from('forms')
      .select('*')
      .eq('slug', slug ?? '')
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => setForm((data as Form | null) ?? null));
    supabase
      .from('class_slots')
      .select('*')
      .eq('active', true)
      .then(({ data }) => setSlots(sortSlots((data ?? []) as ClassSlot[])));
  }, [slug]);

  useEffect(() => {
    if (profile) {
      setName((n) => n || profile.full_name);
      setEmail((e) => e || profile.email);
    }
  }, [profile]);

  // El aviso de error se borra en cuanto el alumno corrige algo.
  useEffect(() => setError(''), [name, email, discord, program, slotId, date, otherDate, questions, answers]);

  const steps = useMemo<Step[]>(() => {
    if (!form) return [];
    if (form.kind === 'pre_clase') {
      return [
        { kind: 'who' },
        { kind: 'program' },
        { kind: 'class' },
        ...questions.map((_, index) => ({ kind: 'question' as const, index })),
        { kind: 'more' },
      ];
    }
    return [{ kind: 'who' }, ...form.questions.map((question) => ({ kind: 'custom' as const, question }))];
  }, [form, questions]);

  const programSlots = useMemo(() => slots.filter((s) => s.programs.includes(program)), [slots, program]);
  const slot = programSlots.find((s) => s.id === slotId);

  const index = typeof stage === 'number' ? stage : -1;
  const step = steps[index];
  const isLast = index === steps.length - 1;

  const goTo = useCallback((i: number) => {
    setError('');
    setStage(i);
  }, []);

  const validate = (s: Step): string => {
    switch (s.kind) {
      case 'who':
        if (!name.trim()) return 'Escribí tu nombre';
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Revisá tu mail';
        if (form?.kind === 'pre_clase' && !discord.trim()) return 'Escribí el nombre de tu canal de Discord';
        return '';
      case 'program':
        return program ? '' : 'Elegí tu programa';
      case 'class':
        if (!slot) return 'Elegí la clase';
        if (!date) return 'Elegí la fecha';
        if (date === OTHER_DATE && !otherDate) return 'Elegí la fecha en el calendario';
        return '';
      case 'question':
        return questions[s.index].trim().length >= 10 ? '' : 'Contanos un poco más (mínimo 10 caracteres)';
      case 'custom':
        return s.question.required && !isAnswered(answers[s.question.id]) ? 'Esta pregunta es obligatoria' : '';
      default:
        return '';
    }
  };

  const submit = async () => {
    if (!form) return;
    setSending(true);
    setError('');
    const callDate = date === OTHER_DATE ? otherDate : date === NO_DATE ? null : date || null;
    const payload =
      form.kind === 'pre_clase'
        ? {
            program,
            coach: slot?.coach ?? null,
            call_kind: slot?.kind ?? null,
            slot_label: slot ? slotLabel(slot) : null,
            call_date: callDate,
            answers: { preguntas: questions.map((q) => q.trim()).filter(Boolean) },
          }
        : { call_date: null, answers };
    const { error: err } = await supabase.from('form_responses').insert({
      form_id: form.id,
      user_id: session?.user.id ?? null,
      respondent_name: name.trim(),
      respondent_email: email.trim().toLowerCase(),
      discord_channel: discord.trim() || null,
      ...payload,
    });
    setSending(false);
    if (err) return setError('No pudimos enviar el formulario. Probá de nuevo.');
    setStage('done');
  };

  const next = () => {
    if (!step) return;
    const msg = validate(step);
    if (msg) return setError(msg);
    if (isLast) return void submit();
    goTo(index + 1);
  };

  const back = () => {
    if (stage === 'intro' || index <= 0) return setStage('intro');
    // Si vuelve desde una pregunta extra vacía, la descartamos.
    if (step?.kind === 'question' && step.index > 0 && !questions[step.index].trim()) {
      setQuestions((qs) => qs.slice(0, -1));
      return goTo(index - 1);
    }
    goTo(index - 1);
  };

  const addQuestion = () => {
    setQuestions((qs) => [...qs, '']);
    goTo(index); // la nueva pregunta ocupa la posición de "¿Tenés otra?"
  };

  // Atajos de teclado: Enter avanza (Shift+Enter = salto de línea), letras eligen opciones.
  const keyHandler = useRef<(e: KeyboardEvent) => void>();
  keyHandler.current = (e: KeyboardEvent) => {
    if (sending) return;
    const target = e.target as HTMLElement;
    const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
    if (e.key === 'Enter' && !e.shiftKey) {
      if (target.classList.contains('sf-back')) return;
      e.preventDefault();
      if (stage === 'intro') setStage(0);
      else if (step && step.kind !== 'more') next();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
    const i = LETTERS.indexOf(e.key.toUpperCase());
    if (i < 0 || !step) return;
    if (step.kind === 'program' && PROGRAMS[i]) pickProgram(PROGRAMS[i]);
    if (step.kind === 'class') {
      if (!slot && programSlots[i]) pickSlot(programSlots[i]);
      else if (slot && dateOptions[i]) setDate(dateOptions[i].value);
    }
    if (step.kind === 'more') (i === 0 ? addQuestion : i === 1 ? submit : () => undefined)();
    if (step.kind === 'custom' && step.question.type === 'select' && step.question.options?.[i]) {
      setAnswers((a) => ({ ...a, [step.question.id]: step.question.options![i] }));
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current?.(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const pickProgram = (p: string) => {
    setProgram(p);
    setError('');
    if (slot && !slot.programs.includes(p)) {
      setSlotId('');
      setDate('');
    }
    setTimeout(() => setStage((s) => (typeof s === 'number' ? s + 1 : s)), 250);
  };

  const pickSlot = (s: ClassSlot) => {
    setSlotId(s.id);
    setDate('');
    setOtherDate('');
    setError('');
  };

  const dateOptions: { value: string; label: ReactNode }[] = slot
    ? slot.kind === 'grupal'
      ? [
          ...upcomingDates(slot).map((d) => ({
            value: d.iso,
            label: (
              <>
                {d.label} <span className="sf-opt__muted">· {d.short}</span>
              </>
            ),
          })),
          { value: OTHER_DATE, label: 'Otra fecha' },
        ]
      : [
          { value: OTHER_DATE, label: 'Ya tengo fecha agendada' },
          { value: NO_DATE, label: 'Todavía no la agendé' },
        ]
    : [];

  if (form === undefined) return <FullScreenMessage loading />;
  if (form === null) {
    return <FullScreenMessage title="Formulario no disponible" text="Este formulario no existe o ya no está activo." />;
  }

  if (stage === 'done') {
    return (
      <Shell>
        <div className="sf-body fade-in">
          <Mark />
          <h1 className="sf-title">¡Listo, {name.trim().split(' ')[0]}!</h1>
          <p className="sf-lead">
            Recibimos {form.kind === 'pre_clase' && questions.length > 1 ? 'tus preguntas' : 'tus respuestas'}. El coach las va a
            leer antes de la clase para ir directo a resolver.
          </p>
        </div>
      </Shell>
    );
  }

  if (stage === 'intro') {
    const st = form.settings ?? {};
    return (
      <Shell>
        <div className="sf-body fade-in">
          <Mark />
          <span className="sf-eyebrow">Genesis</span>
          <h1 className="sf-title sf-title--xl">{form.title}</h1>
          {form.description && <p className="sf-lead">{form.description}</p>}
          {!!st.bullets?.length && (
            <div className="sf-bullets">
              {st.bullets_title && <strong>{st.bullets_title}</strong>}
              <ul>
                {st.bullets.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </div>
          )}
          {st.callout && (
            <p className="sf-callout">
              <span aria-hidden>👉</span> {st.callout} {st.callout_highlight && <strong>{st.callout_highlight}</strong>}
            </p>
          )}
          <OkRow label="Ok, entendido" onClick={() => setStage(0)} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell progress={(index + 1) / steps.length} counter={`${index + 1} / ${steps.length}`} onBack={back}>
      <div className="sf-body fade-in" key={`${step.kind}-${index}`}>
        {step.kind === 'who' && (
          <>
            <Heading>¿Quién sos?</Heading>
            <TextField label="Tu nombre" required value={name} onChange={setName} placeholder="Nombre y apellido" autoFocus autoComplete="name" />
            <TextField label="Tu mail" required type="email" value={email} onChange={setEmail} placeholder="nombre@mail.com" autoComplete="email" />
            {form.kind === 'pre_clase' && (
              <TextField
                label="El nombre de tu canal de Discord"
                required
                help="Copialo tal cual aparece en Discord, así te identificamos."
                value={discord}
                onChange={setDiscord}
                placeholder="#nombre-de-tu-canal"
              />
            )}
          </>
        )}

        {step.kind === 'program' && (
          <>
            <Heading>¿En qué programa estás?</Heading>
            <Options
              options={PROGRAMS.map((p) => ({ value: p, label: p }))}
              value={program}
              onPick={pickProgram}
            />
          </>
        )}

        {step.kind === 'class' && (
          <>
            <Heading>¿Para qué clase es?</Heading>
            <GroupLabel>¿Con quién?</GroupLabel>
            {programSlots.length === 0 && <p className="sf-help">No hay clases cargadas para {program}.</p>}
            <Options
              options={programSlots.map((s) => ({ value: s.id, label: slotLabel(s) }))}
              value={slotId}
              onPick={(id) => pickSlot(programSlots.find((s) => s.id === id)!)}
            />
            {slot && (
              <>
                <GroupLabel>¿Cuándo?</GroupLabel>
                <Options options={dateOptions} value={date} onPick={setDate} />
                {date === OTHER_DATE && (
                  <input
                    className="sf-input sf-input--date"
                    type="date"
                    value={otherDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setOtherDate(e.target.value)}
                    autoFocus
                  />
                )}
              </>
            )}
          </>
        )}

        {step.kind === 'question' && (
          <>
            <Heading required>{step.index === 0 ? 'Tu primera pregunta' : `Tu pregunta ${step.index + 1}`}</Heading>
            {form.settings?.question_help && <p className="sf-help">{form.settings.question_help}</p>}
            {form.settings?.question_example && <p className="sf-help sf-help--example">{form.settings.question_example}</p>}
            <AutoTextarea
              value={questions[step.index]}
              onChange={(v) => setQuestions((qs) => qs.map((q, i) => (i === step.index ? v : q)))}
              placeholder="En qué estás, qué ya probaste y qué necesitás resolver…"
            />
          </>
        )}

        {step.kind === 'more' && (
          <>
            <Heading>¿Tenés otra pregunta?</Heading>
            <Options
              options={[
                { value: 'si', label: 'Sí, tengo otra' },
                { value: 'no', label: sending ? 'Enviando…' : 'No, enviar' },
              ]}
              value=""
              onPick={(v) => (v === 'si' ? addQuestion() : void submit())}
            />
          </>
        )}

        {step.kind === 'custom' && <CustomQuestion question={step.question} value={answers[step.question.id]} onChange={(v) => setAnswers((a) => ({ ...a, [step.question.id]: v }))} />}

        {error && <p className="sf-error" role="alert">{error}</p>}
        {step.kind !== 'more' && step.kind !== 'program' && (
          <OkRow
            label={isLast ? (sending ? 'Enviando…' : 'Enviar') : 'OK'}
            onClick={next}
            disabled={sending}
            hint={step.kind === 'question' || (step.kind === 'custom' && step.question.type === 'textarea') ? 'Shift + Enter para salto de línea' : undefined}
          />
        )}
      </div>
    </Shell>
  );
}

/* ---------------------------------------------------------------- */

function Shell({ children, progress, counter, onBack }: { children: ReactNode; progress?: number; counter?: string; onBack?: () => void }) {
  return (
    <div className="sf">
      {progress !== undefined && (
        <div className="sf-progress" aria-hidden>
          <div className="sf-progress__bar" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      <header className="sf-top">
        <span className="sf-brand"><MarkSmall /> GENESIS</span>
        {counter && <span className="sf-counter">{counter}</span>}
      </header>
      <main className="sf-main">{children}</main>
      {onBack && (
        <button
          type="button"
          className="sf-back"
          onClick={(e) => {
            e.currentTarget.blur(); // que Enter siga avanzando después de volver
            onBack();
          }}
        >
          ← Atrás
        </button>
      )}
    </div>
  );
}

const Mark = () => (
  <svg className="sf-mark" viewBox="0 0 64 64" aria-hidden>
    <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="7" />
    <circle cx="32" cy="32" r="7" fill="currentColor" />
  </svg>
);
const MarkSmall = () => (
  <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden>
    <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="8" />
    <circle cx="32" cy="32" r="8" fill="currentColor" />
  </svg>
);

function Heading({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <h1 className="sf-q">
      {children}
      {required && <span className="sf-req">*</span>}
    </h1>
  );
}

const GroupLabel = ({ children }: { children: ReactNode }) => (
  <p className="sf-label">{children}<span className="sf-req">*</span></p>
);

function OkRow({ label, onClick, disabled, hint }: { label: string; onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <div className="sf-ok">
      <button type="button" className="sf-ok__btn" onClick={onClick} disabled={disabled}>{label}</button>
      <span className="sf-ok__hint">
        presioná <strong>Enter ↵</strong>
        {hint && <> · {hint}</>}
      </span>
    </div>
  );
}

function Options({ options, value, onPick }: { options: { value: string; label: ReactNode }[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="sf-opts" role="radiogroup">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`sf-opt${value === o.value ? ' is-active' : ''}`}
          onClick={() => onPick(o.value)}
        >
          <span className="sf-opt__key">{LETTERS[i]}</span>
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  help?: string;
}

function TextField({ label, value, onChange, placeholder, required, type = 'text', autoFocus, autoComplete, help }: TextFieldProps) {
  return (
    <label className="sf-field">
      <span className="sf-label">{label}{required && <span className="sf-req">*</span>}</span>
      {help && <span className="sf-help">{help}</span>}
      <input className="sf-input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} autoComplete={autoComplete} />
    </label>
  );
}

function AutoTextarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className="sf-input sf-input--area"
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      autoFocus
    />
  );
}

function CustomQuestion({ question: q, value, onChange }: { question: Question; value: string | number | undefined; onChange: (v: string | number) => void }) {
  return (
    <>
      <Heading required={q.required}>{q.label}</Heading>
      {q.help && <p className="sf-help">{q.help}</p>}
      {q.type === 'text' && <input className="sf-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} autoFocus placeholder="Escribí tu respuesta…" />}
      {q.type === 'textarea' && <AutoTextarea value={String(value ?? '')} onChange={onChange} placeholder="Escribí tu respuesta…" />}
      {q.type === 'select' && <Options options={(q.options ?? []).map((o) => ({ value: o, label: o }))} value={String(value ?? '')} onPick={onChange} />}
      {q.type === 'scale' && (
        <div className="sf-scale">
          {Array.from({ length: (q.max ?? 5) - (q.min ?? 1) + 1 }, (_, i) => (q.min ?? 1) + i).map((n) => (
            <button key={n} type="button" className={`sf-scale__opt${value === n ? ' is-active' : ''}`} onClick={() => onChange(n)}>{n}</button>
          ))}
        </div>
      )}
    </>
  );
}
