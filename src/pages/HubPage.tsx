import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useProgress } from '../progress/ProgressContext';
import { useContent } from '../content/ContentContext';
import { ArrowRight, Chart, Layers, Vault } from '../components/Icons';
import { useAsync } from '../lib/useAsync';
import { fetchMyOnboarding } from '../onboarding/api';

export default function HubPage() {
  const { profile, isAdmin } = useAuth();
  const { data: onboarding, loading: onbLoading } = useAsync(() => (profile && !isAdmin ? fetchMyOnboarding(profile.id) : Promise.resolve(null)), [profile?.id, isAdmin]);
  const showOnboarding = !isAdmin && !onbLoading && !onboarding?.completed_at;
  const { overallPercent } = useProgress();
  const { modules, tools } = useContent();
  const firstName = profile?.full_name.split(' ')[0] || 'de nuevo';

  const cards = [
    { to: '/avance', n: '01', title: 'Tu avance', text: `${overallPercent}% del programa completado`, Icon: Chart },
    { to: '/modulos', n: '02', title: 'Módulos', text: `${modules.length} ${modules.length === 1 ? 'módulo' : 'módulos'} de contenido grabado`, Icon: Layers },
    { to: '/herramientas', n: '03', title: 'Baúl de herramientas', text: `${tools.length} ${tools.length === 1 ? 'herramienta' : 'plantillas y recursos'}`, Icon: Vault },
  ];

  return (
    <div className="fade-in">
      <header className="page__header page__header--center">
        <span className="eyebrow">Campus Genesis</span>
        <h1 className="page__title">Hola, {firstName}</h1>
        <p className="page__lead">¿Por dónde querés continuar hoy?</p>
      </header>
      {showOnboarding && (
        <Link to="/onboarding" className="glass onb-banner">
          <div className="onb-banner__text">
            <span className="eyebrow">Primer paso</span>
            <span className="onb-banner__title">{onboarding ? 'Terminá tu formulario de onboarding' : 'Completá tu formulario de onboarding'}</span>
            <span className="muted">Con esto el equipo conoce tu punto de partida y arma tu plan. Tu avance se guarda solo.</span>
          </div>
          <span className="btn btn--primary">{onboarding ? 'Continuar' : 'Empezar'} <ArrowRight width={16} height={16} /></span>
        </Link>
      )}
      <div className="hub">
        {cards.map(({ to, n, title, text, Icon }) => (
          <Link key={to} to={to} className="glass hub__card">
            <div className="hub__top">
              <span className="hub__num">{n}</span>
              <span className="hub__icon"><Icon /></span>
            </div>
            <div>
              <h2 className="hub__title">{title}</h2>
              <p className="muted">{text}</p>
            </div>
            <span className="hub__go">Ingresar <ArrowRight width={16} height={16} /></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
