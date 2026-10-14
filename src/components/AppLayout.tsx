import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Logout } from './Icons';

export const SECTIONS = [
  { to: '/avance', label: 'Tu avance' },
  { to: '/modulos', label: 'Módulos' },
  { to: '/herramientas', label: 'Baúl de herramientas' },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">Genesis</Link>
        <nav className="topbar__nav">
          {SECTIONS.map((s) => (
            <NavLink key={s.to} to={s.to} className="topbar__link">
              {s.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar__user">
          <span className="avatar" title={user?.email}>{user?.name.charAt(0)}</span>
          <button className="icon-btn" onClick={handleLogout} aria-label="Cerrar sesión" title="Cerrar sesión">
            <Logout />
          </button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
