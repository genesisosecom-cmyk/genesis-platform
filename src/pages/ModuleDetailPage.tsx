import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { MODULES, findModule } from '../data/content';
import { useProgress } from '../progress/ProgressContext';
import VideoPlayer from '../components/VideoPlayer';
import ProgressBar from '../components/ProgressBar';
import { ArrowLeft, ArrowRight, Check } from '../components/Icons';

export default function ModuleDetailPage() {
  const { moduleId, lessonId } = useParams();
  const { isCompleted, toggleCompleted, markWatched, moduleProgress } = useProgress();
  const module = findModule(moduleId);
  const lessonIndex = module ? Math.max(0, module.lessons.findIndex((l) => l.id === lessonId)) : 0;
  const lesson = module?.lessons[lessonIndex];

  useEffect(() => {
    if (module && lesson) markWatched(module.id, lesson.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module?.id, lesson?.id]);

  if (!module || !lesson) return <Navigate to="/modulos" replace />;

  const prev = module.lessons[lessonIndex - 1];
  const next = module.lessons[lessonIndex + 1];
  const nextModule = MODULES.find((m) => m.number === module.number + 1);
  const done = isCompleted(module.id, lesson.id);
  const p = moduleProgress(module);

  return (
    <div className="fade-in">
      <Link to="/modulos" className="back"><ArrowLeft width={16} height={16} /> Módulos</Link>
      <header className="page__header">
        <span className="eyebrow">Módulo {String(module.number).padStart(2, '0')} · {module.title}</span>
        <h1 className="page__title page__title--sm">{lesson.title}</h1>
      </header>

      <div className="lesson-layout">
        <section>
          <VideoPlayer url={lesson.videoUrl} title={lesson.title} />
          <div className="lesson-actions">
            <button className={`btn ${done ? 'btn--done' : 'btn--primary'}`} onClick={() => toggleCompleted(module.id, lesson.id)}>
              <Check width={16} height={16} /> {done ? 'Completada' : 'Marcar como completada'}
            </button>
            <div className="lesson-actions__nav">
              {prev && (
                <Link className="btn btn--ghost" to={`/modulos/${module.id}/${prev.id}`}><ArrowLeft width={16} height={16} /> Anterior</Link>
              )}
              {next ? (
                <Link className="btn btn--ghost" to={`/modulos/${module.id}/${next.id}`}>Siguiente <ArrowRight width={16} height={16} /></Link>
              ) : nextModule ? (
                <Link className="btn btn--ghost" to={`/modulos/${nextModule.id}`}>Módulo {nextModule.number} <ArrowRight width={16} height={16} /></Link>
              ) : null}
            </div>
          </div>
          {lesson.description && <p className="lesson-desc muted">{lesson.description}</p>}
        </section>

        <aside className="glass lessons">
          <div className="lessons__head">
            <span className="eyebrow">Lecciones</span>
            <span className="muted">{p.done}/{p.total}</span>
          </div>
          <ProgressBar percent={p.percent} />
          <ol className="lessons__list">
            {module.lessons.map((l, i) => {
              const c = isCompleted(module.id, l.id);
              return (
                <li key={l.id}>
                  <Link
                    to={`/modulos/${module.id}/${l.id}`}
                    className={`lesson-item${l.id === lesson.id ? ' is-active' : ''}${c ? ' is-done' : ''}`}
                  >
                    <span className="lesson-item__state">{c ? <Check width={14} height={14} /> : i + 1}</span>
                    <span className="lesson-item__title">{l.title}</span>
                    <span className="lesson-item__time">{l.duration}′</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
