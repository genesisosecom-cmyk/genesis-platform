import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useContent } from '../content/ContentContext';
import type { Module } from '../data/content';
import FullScreenMessage from '../components/FullScreenMessage';
import { openFileOrLink } from '../content/files';
import { useProgress } from '../progress/ProgressContext';
import VideoPlayer from '../components/VideoPlayer';
import ProgressBar from '../components/ProgressBar';
import { ArrowLeft, ArrowRight, Check } from '../components/Icons';

/** Lecciones agrupadas por sección (las sin sección primero), con su número dentro del módulo. */
function groupBySection(module: Module) {
  const withIndex = module.lessons.map((lesson, index) => ({ lesson, index }));
  const groups = [
    { id: null as string | null, title: '', lessons: withIndex.filter((x) => !x.lesson.sectionId) },
    ...module.sections.map((s) => ({ id: s.id as string | null, title: s.title, lessons: withIndex.filter((x) => x.lesson.sectionId === s.id) })),
  ];
  return groups.filter((g) => g.lessons.length);
}

export default function ModuleDetailPage() {
  const { moduleId, lessonId } = useParams();
  const { isCompleted, toggleCompleted, markWatched, moduleProgress } = useProgress();
  const { modules: MODULES, findModule, loading } = useContent();
  const module = findModule(moduleId);
  const lessonIndex = module ? Math.max(0, module.lessons.findIndex((l) => l.id === lessonId)) : 0;
  const lesson = module?.lessons[lessonIndex];

  useEffect(() => {
    if (module && lesson) markWatched(module.id, lesson.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module?.id, lesson?.id]);

  if (loading) return <FullScreenMessage loading />;
  if (!module || !lesson) return <Navigate to="/modulos" replace />;

  const prev = module.lessons[lessonIndex - 1];
  const next = module.lessons[lessonIndex + 1];
  const nextModule = MODULES.find((m) => m.number === module.number + 1);
  const done = isCompleted(module.id, lesson.id);
  const p = moduleProgress(module);
  const section = module.sections.find((x) => x.id === lesson.sectionId);

  return (
    <div className="fade-in">
      <Link to="/modulos" className="back"><ArrowLeft width={16} height={16} /> Módulos</Link>
      <header className="page__header">
        <span className="eyebrow">Módulo {String(module.number).padStart(2, '0')} · {module.title}{section ? ` · ${section.title}` : ''}</span>
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
          {lesson.resources.length > 0 && (
            <section className="resources">
              <span className="eyebrow resources__title">Recursos de la clase</span>
              <ol className="resources__list">
                {lesson.resources.map((r, i) => (
                  <li key={r.id}>
                    <span className="resources__n">{String(i + 1).padStart(2, '0')}</span>
                    <span>
                      <button type="button" className="resources__link" onClick={() => openFileOrLink(r)}>
                        {r.title}
                      </button>
                      {r.description && <span className="muted"> — {r.description}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </section>

        <aside className="glass lessons">
          <div className="lessons__head">
            <span className="eyebrow">Lecciones</span>
            <span className="muted">{p.done}/{p.total}</span>
          </div>
          <ProgressBar percent={p.percent} />
          {groupBySection(module).map((g) => (
            <div key={g.id ?? 'none'} className="lessons__group">
              {g.title && <span className="lessons__section">{g.title}</span>}
              <ol className="lessons__list">
                {g.lessons.map(({ lesson: l, index: i }) => {
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
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
