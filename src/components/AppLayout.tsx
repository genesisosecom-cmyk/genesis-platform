import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useTeamHome } from '../auth/RequireAuth';
import { Logout } from './Icons';
import { LeadSoundToggle } from './NewLeadSound';

export const SECTIONS = [
  { to: '/avance', label: 'Tu avance' },
  { to: '/modulos', label: 'Módulos' },
  { to: '/herramientas', label: 'Baúl de herramientas' },
];

export default function AppLayout() {
  const { profile, isAdmin, isSdr, isCloser, isTeamOnly, logout } = useAuth();
  const teamHome = useTeamHome();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="shell">
      <header className="topbar">
        <Link to={isTeamOnly && teamHome ? teamHome : '/'} className="brand">Genesis</Link>
        <nav className="topbar__nav">
          {!isTeamOnly &&
            SECTIONS.map((s) => (
              <NavLink key={s.to} to={s.to} className="topbar__link">
                {s.label}
              </NavLink>
            ))}
          {isSdr && (
            <NavLink to="/sdr" className="topbar__link">
              Leads
            </NavLink>
          )}
          {isCloser && (
            <NavLink to="/closer" className="topbar__link">
              Calls
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/admin" className="topbar__link topbar__link--admin">
              Admin
            </NavLink>
          )}
        </nav>
        <div className="topbar__user">
          <LeadSoundToggle />
          <span className="avatar" title={profile?.email}>
            {(profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()}
          </span>
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
