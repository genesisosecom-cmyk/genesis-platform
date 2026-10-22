import { Link } from 'react-router-dom';
import { formatMinutes, moduleDuration } from '../data/content';
import { useContent } from '../content/ContentContext';
import { useProgress } from '../progress/ProgressContext';
import ProgressBar from '../components/ProgressBar';
import { Check } from '../components/Icons';

export default function ModulesPage() {
  const { moduleProgress } = useProgress();
  const { modules: MODULES, loading } = useContent();
  return (
    <div className="fade-in">
      <header className="page__header">
        <span className="eyebrow">02 · Módulos</span>
        <h1 className="page__title">Contenido grabado</h1>
        <p className="page__lead">Avanzá a tu ritmo. Tu progreso se guarda automáticamente.</p>
      </header>
      {!loading && MODULES.length === 0 && <p className="muted">Todavía no hay módulos publicados.</p>}
      <div className="grid">
        {MODULES.map((m) => {
          const p = moduleProgress(m);
          return (
            <Link key={m.id} to={`/modulos/${m.id}`} className="glass module-card">
              <div className="module-card__top">
                <span className="module-card__num">{String(m.number).padStart(2, '0')}</span>
                {p.percent === 100 && <span className="badge"><Check width={14} height={14} /> Completo</span>}
              </div>
              <h2 className="module-card__title">{m.title}</h2>
              <p className="muted">{m.subtitle}</p>
              <div className="module-card__meta">
                <span>{m.lessons.length} lecciones · {formatMinutes(moduleDuration(m))}</span>
                <span>{p.percent}%</span>
              </div>
              <ProgressBar percent={p.percent} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
