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

  const groups = groupBySection(module);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="lp fade-in">
      <aside className="lp-nav">
        <div className="lp-nav__inner">
          <Link to="/modulos" className="back lp-nav__back"><ArrowLeft width={16} height={16} /> Todos los módulos</Link>
          <div className="lp-nav__module">
            <span className="lp-nav__num">{pad(module.number)}</span>
            <div>
              <span className="eyebrow">Módulo {pad(module.number)}</span>
              <h2 className="lp-nav__title">{module.title}</h2>
            </div>
          </div>
          <div className="lp-nav__progress">
            <div className="lp-nav__progress-row">
              <span>{p.done} de {p.total} clases</span>
              <strong>{p.percent}%</strong>
            </div>
            <ProgressBar percent={p.percent} />
          </div>

          <nav className="lp-nav__list" aria-label="Clases del módulo">
            {groups.map((g) => (
              <div key={g.id ?? 'none'} className="lp-group">
                {g.title && (
                  <span className="lp-group__title">
                    {g.title}
                    <span className="lp-group__count">{g.lessons.filter(({ lesson: l }) => isCompleted(module.id, l.id)).length}/{g.lessons.length}</span>
                  </span>
                )}
                <ol className="lp-group__list">
                  {g.lessons.map(({ lesson: l, index: i }) => {
                    const c = isCompleted(module.id, l.id);
                    const active = l.id === lesson.id;
                    return (
                      <li key={l.id}>
                        <Link
                          to={`/modulos/${module.id}/${l.id}`}
                          className={`lp-item${active ? ' is-active' : ''}${c ? ' is-done' : ''}`}
                          aria-current={active ? 'page' : undefined}
                        >
                          <span className="lp-item__state">{c ? <Check width={13} height={13} /> : pad(i + 1)}</span>
                          <span className="lp-item__title">{l.title}</span>
                          <span className="lp-item__time">{l.duration ? `${l.duration} min` : ''}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <main className="lp-main">
        <header className="lp-head">
          <span className="eyebrow lp-head__crumb">
            Módulo {pad(module.number)} · {module.title}
            {section && <> · <span className="lp-head__section">{section.title}</span></>}
          </span>
          <h1 className="lp-head__title">{lesson.title}</h1>
          <div className="lp-head__meta">
            <span>Clase {lessonIndex + 1} de {module.lessons.length}</span>
            {lesson.duration > 0 && <span>{lesson.duration} min</span>}
            {lesson.resources.length > 0 && <span>{lesson.resources.length} {lesson.resources.length === 1 ? 'recurso' : 'recursos'}</span>}
            {done && <span className="lp-head__done"><Check width={13} height={13} /> Completada</span>}
          </div>
        </header>

        <div className="lp-player">
          <VideoPlayer url={lesson.videoUrl} title={lesson.title} />
        </div>

        <div className="lp-actions">
          <button className={`btn btn--lg ${done ? 'btn--done' : 'btn--primary'}`} onClick={() => toggleCompleted(module.id, lesson.id)}>
            <Check width={16} height={16} /> {done ? 'Completada' : 'Marcar como completada'}
          </button>
          <div className="lp-actions__nav">
            {prev && (
              <Link className="btn btn--ghost btn--lg" to={`/modulos/${module.id}/${prev.id}`}><ArrowLeft width={16} height={16} /> Anterior</Link>
            )}
            {next ? (
              <Link className="btn btn--ghost btn--lg lp-next" to={`/modulos/${module.id}/${next.id}`}>
                <span className="lp-next__label">
                  <small>Siguiente</small>
                  {next.title}
                </span>
                <ArrowRight width={16} height={16} />
              </Link>
            ) : nextModule ? (
              <Link className="btn btn--ghost btn--lg lp-next" to={`/modulos/${nextModule.id}`}>
                <span className="lp-next__label">
                  <small>Siguiente módulo</small>
                  {nextModule.title}
                </span>
                <ArrowRight width={16} height={16} />
              </Link>
            ) : null}
          </div>
        </div>

        {(lesson.description || lesson.resources.length > 0) && (
          <div className="lp-body">
            {lesson.description && (
              <section className="lp-about">
                <span className="eyebrow">Sobre esta clase</span>
                <p>{lesson.description}</p>
              </section>
            )}
            {lesson.resources.length > 0 && (
              <section className="resources">
                <span className="eyebrow resources__title">Recursos de la clase</span>
                <ol className="resources__list">
                  {lesson.resources.map((r, i) => (
                    <li key={r.id}>
                      <span className="resources__n">{pad(i + 1)}</span>
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
          </div>
        )}
      </main>
    </div>
  );
}
