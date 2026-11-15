import { answerText, isFilled, visibleQuestions, visibleSteps, type Answers } from '../../onboarding/questions';

/** Respuestas del formulario de onboarding agrupadas por paso, como las vio el alumno. */
export default function OnboardingAnswers({ answers }: { answers: Answers }) {
  return (
    <div className="onb-answers">
      {visibleSteps(answers).map((s, i) => (
        <section key={s.id} className="onb-answers__step">
          <h4 className="onb-answers__title">{i + 1}. {s.title}</h4>
          {visibleQuestions(s, answers).map((q) => (
            <div key={q.id} className="onb-answers__item">
              <span className="onb-answers__q">{q.label}</span>
              {isFilled(answers[q.id]) ? (
                <span className="onb-answers__a">{answerText(answers[q.id])}</span>
              ) : (
                <span className="onb-answers__a onb-answers__a--empty">Sin responder</span>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
