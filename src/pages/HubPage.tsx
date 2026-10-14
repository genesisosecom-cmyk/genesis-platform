import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useProgress } from '../progress/ProgressContext';
import { MODULES, TOOLS } from '../data/content';
import { ArrowRight, Chart, Layers, Vault } from '../components/Icons';

export default function HubPage() {
  const { user } = useAuth();
  const { overallPercent } = useProgress();
  const firstName = user?.name.split(' ')[0];

  const cards = [
    { to: '/avance', n: '01', title: 'Tu avance', text: `${overallPercent}% del programa completado`, Icon: Chart },
    { to: '/modulos', n: '02', title: 'Módulos', text: `${MODULES.length} módulos de contenido grabado`, Icon: Layers },
    { to: '/herramientas', n: '03', title: 'Baúl de herramientas', text: `${TOOLS.length} plantillas y recursos`, Icon: Vault },
  ];

  return (
    <div className="fade-in">
      <header className="page__header page__header--center">
        <span className="eyebrow">Bienvenido de nuevo</span>
        <h1 className="page__title">Hola, {firstName}</h1>
        <p className="page__lead">¿Por dónde querés continuar hoy?</p>
      </header>
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
