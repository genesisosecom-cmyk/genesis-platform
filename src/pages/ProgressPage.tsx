import { Link } from 'react-router-dom';
import { useProgress } from '../progress/ProgressContext';
import { formatMinutes } from '../data/content';
import { useContent } from '../content/ContentContext';
import ProgressRing from '../components/ProgressRing';
import ProgressBar from '../components/ProgressBar';
import { ArrowRight, Play } from '../components/Icons';

export default function ProgressPage() {
  const { overallPercent, completedCount, lastWatched, moduleProgress, isCompleted } = useProgress();
  const { modules: MODULES, totalLessons: TOTAL_LESSONS, findModule } = useContent();

  const minutesDone = MODULES.reduce(
    (sum, m) => sum + m.lessons.filter((l) => isCompleted(m.id, l.id)).reduce((s, l) => s + l.duration, 0),
    0,
  );
  const modulesDone = MODULES.filter((m) => m.lessons.length > 0 && moduleProgress(m).percent === 100).length;

  // Siguiente lección: la última vista o la primera sin completar.
  const resume = (() => {
    const m = findModule(lastWatched?.moduleId);
    const l = m?.lessons.find((x) => x.id === lastWatched?.lessonId);
    if (m && l && !isCompleted(m.id, l.id)) return { module: m, lesson: l };
    for (const mod of MODULES) {
      const next = mod.lessons.find((x) => !isCompleted(mod.id, x.id));
      if (next) return { module: mod, lesson: next };
    }
    return null;
  })();

  return (
    <div className="fade-in">
      <header className="page__header">
        <span className="eyebrow">01 · Tu avance</span>
        <h1 className="page__title">Tu progreso</h1>
      </header>

      <section className="progress-hero">
        <div className="glass progress-hero__ring">
          <ProgressRing percent={overallPercent} label="Completado" />
        </div>
        <div className="stats">
          <div className="glass stat"><span className="stat__value">{completedCount}<small>/{TOTAL_LESSONS}</small></span><span className="eyebrow">Lecciones</span></div>
          <div className="glass stat"><span className="stat__value">{modulesDone}<small>/{MODULES.length}</small></span><span className="eyebrow">Módulos</span></div>
          <div className="glass stat"><span className="stat__value">{formatMinutes(minutesDone)}</span><span className="eyebrow">Tiempo visto</span></div>
          {resume ? (
            <Link to={`/modulos/${resume.module.id}/${resume.lesson.id}`} className="glass stat stat--cta">
              <span className="eyebrow">Continuar · Módulo {resume.module.number}</span>
              <span className="stat__resume"><Play width={16} height={16} /> {resume.lesson.title}</span>
            </Link>
          ) : (
            <div className="glass stat stat--cta"><span className="eyebrow">Programa completo</span><span className="stat__resume">¡Felicitaciones!</span></div>
          )}
        </div>
      </section>

      <h2 className="section-title">Por módulo</h2>
      <div className="list">
        {MODULES.map((m) => {
          const p = moduleProgress(m);
          return (
            <Link key={m.id} to={`/modulos/${m.id}`} className="glass row">
              <span className="row__num">{String(m.number).padStart(2, '0')}</span>
              <div className="row__body">
                <div className="row__head">
                  <span>{m.title}</span>
                  <span className="muted">{p.done}/{p.total} · {p.percent}%</span>
                </div>
                <ProgressBar percent={p.percent} />
              </div>
              <ArrowRight width={18} height={18} className="row__arrow" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
