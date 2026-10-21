import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Form } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import QuestionField, { isAnswered } from '../forms/QuestionField';
import FullScreenMessage from '../components/FullScreenMessage';
import { Check } from '../components/Icons';

/** Formulario pre-llamada que Manu comparte por link. No requiere login. */
export default function PublicFormPage() {
  const { slug } = useParams();
  const { session, profile } = useAuth();
  const [form, setForm] = useState<Form | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [callDate, setCallDate] = useState('');
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase
      .from('forms')
      .select('*')
      .eq('slug', slug ?? '')
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => setForm((data as Form | null) ?? null));
  }, [slug]);

  useEffect(() => {
    if (profile) {
      setName((n) => n || profile.full_name);
      setEmail((e) => e || profile.email);
    }
  }, [profile]);

  if (form === undefined) return <FullScreenMessage loading />;
  if (form === null) {
    return <FullScreenMessage title="Formulario no disponible" text="Este formulario no existe o ya no está activo." />;
  }
  if (sent) {
    return (
      <FullScreenMessage
        title="¡Gracias!"
        text="Recibimos tus respuestas. Las vamos a revisar antes de la llamada para ir directo a resolver."
      />
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Completá tu nombre y un email válido');
    const missing = form.questions.find((q) => q.required && !isAnswered(answers[q.id]));
    if (missing) return setError(`Falta responder: "${missing.label}"`);
    setError('');
    setSending(true);
    const { error: err } = await supabase.from('form_responses').insert({
      form_id: form.id,
      user_id: session?.user.id ?? null,
      respondent_name: name.trim(),
      respondent_email: email.trim().toLowerCase(),
      call_date: callDate || null,
      answers,
    });
    setSending(false);
    if (err) return setError('No pudimos enviar el formulario. Probá de nuevo.');
    setSent(true);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="public-form">
      <form className="public-form__card fade-in" onSubmit={onSubmit} noValidate>
        <span className="brand">Genesis</span>
        <header className="page__header">
          <span className="eyebrow">Llamada {form.call_type === '1:1' ? '1:1' : 'grupal'}</span>
          <h1 className="page__title page__title--sm">{form.title}</h1>
          {form.description && <p className="page__lead">{form.description}</p>}
        </header>

        <div className="form-grid">
          <div className="q">
            <label className="q__label" htmlFor="pf-name">Nombre y apellido<span className="q__req">*</span></label>
            <input id="pf-name" className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div className="q">
            <label className="q__label" htmlFor="pf-email">Email<span className="q__req">*</span></label>
            <input id="pf-email" className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="q">
            <label className="q__label" htmlFor="pf-date">Fecha de la llamada</label>
            <input id="pf-date" className="field" type="date" value={callDate} onChange={(e) => setCallDate(e.target.value)} />
          </div>
        </div>

        {form.questions.map((q) => (
          <QuestionField key={q.id} question={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
        ))}

        <p className="login__error" role="alert">{error}</p>
        <button className="btn btn--primary btn--lg" type="submit" disabled={sending}>
          {sending ? <span className="spinner" /> : <Check width={16} height={16} />} Enviar respuestas
        </button>
      </form>
    </div>
  );
}
