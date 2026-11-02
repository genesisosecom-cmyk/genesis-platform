import { useEffect, useState, type ComponentType, type SVGProps } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  Bars,
  Book,
  Calendar,
  Coins,
  Doc,
  Grid,
  Headset,
  Home,
  Inbox,
  Logout,
  Menu,
  Phone,
  Sliders,
  Target,
  Team,
  Trend,
  User,
  Wallet,
  Wrench,
} from '../components/Icons';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
interface Item {
  to: string;
  label: string;
  icon: Icon;
  end?: boolean;
}

/** Secciones de la barra lateral, agrupadas como en el diseño. */
const GROUPS: { title: string; items: Item[] }[] = [
  { title: 'General', items: [{ to: '/admin', label: 'Resumen', icon: Home, end: true }] },
  {
    title: 'Ventas',
    items: [
      { to: '/admin/ventas', label: 'Ventas', icon: Trend },
      { to: '/admin/leads', label: 'Leads', icon: Target },
      { to: '/admin/metricas', label: 'Métricas', icon: Bars },
      { to: '/admin/equipo', label: 'Equipo', icon: Team },
      { to: '/admin/crm', label: 'Config. CRM', icon: Sliders },
    ],
  },
  {
    title: 'Paneles',
    items: [
      { to: '/admin/panel-sdr', label: 'Panel SDR', icon: Headset },
      { to: '/admin/panel-closer', label: 'Panel closer', icon: Phone },
    ],
  },
  {
    title: 'Campus',
    items: [
      { to: '/admin/usuarios', label: 'Usuarios', icon: User },
      { to: '/admin/contenido', label: 'Contenido', icon: Book },
      { to: '/admin/herramientas', label: 'Herramientas', icon: Wrench },
    ],
  },
  {
    title: 'Formularios',
    items: [
      { to: '/admin/respuestas', label: 'Respuestas', icon: Inbox },
      { to: '/admin/formularios', label: 'Formularios', icon: Doc },
      { to: '/admin/agenda', label: 'Agenda', icon: Calendar },
    ],
  },
  {
    title: 'Finanzas',
    items: [
      { to: '/admin/clientes', label: 'Clientes y pagos', icon: Wallet },
      { to: '/admin/finanzas', label: 'Finanzas', icon: Coins },
    ],
  },
];

const STORAGE_KEY = 'admin-rail-open';

function readOpen() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Sección activa (la más específica que coincide con la ruta). */
function useCurrent() {
  const { pathname } = useLocation();
  const all = GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));
  return all
    .filter((i) => (i.end ? pathname === i.to : pathname === i.to || pathname.startsWith(`${i.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0];
}

export default function AdminLayout() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const current = useCurrent();
  const [open, setOpen] = useState(readOpen);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    } catch {
      /* sin storage: la barra arranca cerrada */
    }
  }, [open]);

  useEffect(() => {
    setMobileOpen(false);
    setMenu(false);
  }, [pathname]);

  const initial = (profile?.full_name || profile?.email || '?').charAt(0).toUpperCase();
  const expanded = open || mobileOpen;

  return (
    <div className={`admin${expanded ? ' admin--open' : ''}${mobileOpen ? ' admin--mobile-open' : ''}`}>
      <aside className="rail" aria-label="Panel de control">
        <button type="button" className="rail__item rail__toggle" onClick={() => (window.matchMedia('(max-width: 900px)').matches ? setMobileOpen(false) : setOpen((o) => !o))} aria-label={expanded ? 'Achicar menú' : 'Expandir menú'} aria-expanded={expanded}>
          <Menu width={18} height={18} />
        </button>
        <div className="rail__sep" />
        <Link to="/admin" className="rail__brand" title="Genesis · Panel de control">
          <span className="rail__logo">G</span>
          <span className="rail__label rail__brand-name">Genesis <small>Superadmin</small></span>
        </Link>

        <nav className="rail__nav">
          {GROUPS.map((g) => (
            <div key={g.title} className="rail__group">
              <span className="rail__group-title">{g.title}</span>
              {g.items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className="rail__item" title={expanded ? undefined : i.label}>
                  <i.icon width={18} height={18} />
                  <span className="rail__label">{i.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="rail__bottom">
          <Link to="/" className="rail__item" title={expanded ? undefined : 'Ir al campus'}>
            <Grid width={18} height={18} />
            <span className="rail__label">Ir al campus</span>
          </Link>
          <div className="rail__me">
            <button type="button" className="rail__item rail__avatar-btn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} title={profile?.email}>
              <span className="rail__avatar">{initial}</span>
              <span className="rail__label rail__who">{profile?.full_name || profile?.email}</span>
            </button>
            {menu && (
              <div className="rail__menu glass" role="menu">
                <span className="muted rail__menu-email">{profile?.email}</span>
                <button type="button" className="rail__menu-item" role="menuitem" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>
                  <Logout width={16} height={16} /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
      {mobileOpen && <div className="rail__scrim" onClick={() => setMobileOpen(false)} />}

      <div className="admin__main">
        <header className="admin__top">
          <button type="button" className="icon-btn admin__burger" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">
            <Menu width={18} height={18} />
          </button>
          <div>
            <span className="eyebrow">{current?.group ?? 'Superadmin'}</span>
            <h1 className="admin__title">{current?.label ?? 'Panel de control'}</h1>
          </div>
        </header>
        <div className="admin__content fade-in" key={current?.to}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
