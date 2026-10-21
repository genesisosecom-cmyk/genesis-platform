import type { Question } from '../lib/types';

interface Props {
  question: Question;
  value: string | number | undefined;
  onChange: (value: string | number) => void;
}

export default function QuestionField({ question: q, value, onChange }: Props) {
  const id = `q-${q.id}`;
  let input;
  if (q.type === 'textarea') {
    input = <textarea id={id} className="field field--area" rows={4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={q.required} />;
  } else if (q.type === 'select') {
    input = (
      <div className="chips" role="radiogroup" aria-labelledby={`${id}-label`}>
        {(q.options ?? []).map((opt) => (
          <button type="button" key={opt} role="radio" aria-checked={value === opt} className={`chip${value === opt ? ' is-active' : ''}`} onClick={() => onChange(opt)}>
            {opt}
          </button>
        ))}
      </div>
    );
  } else if (q.type === 'scale') {
    const min = q.min ?? 1;
    const max = q.max ?? 5;
    input = (
      <div className="scale" role="radiogroup" aria-labelledby={`${id}-label`}>
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
          <button type="button" key={n} role="radio" aria-checked={value === n} className={`scale__opt${value === n ? ' is-active' : ''}`} onClick={() => onChange(n)}>
            {n}
          </button>
        ))}
      </div>
    );
  } else {
    input = <input id={id} className="field" value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={q.required} />;
  }

  return (
    <div className="q">
      <label htmlFor={id} id={`${id}-label`} className="q__label">
        {q.label}
        {q.required && <span className="q__req">*</span>}
      </label>
      {q.help && <p className="q__help muted">{q.help}</p>}
      {input}
    </div>
  );
}

export function isAnswered(v: string | number | undefined) {
  return v !== undefined && String(v).trim() !== '';
}
