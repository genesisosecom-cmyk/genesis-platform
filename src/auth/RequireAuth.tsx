import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import FullScreenMessage from '../components/FullScreenMessage';
import ChangeTempPasswordPage from '../pages/ChangeTempPasswordPage';

type Area = 'admin' | 'campus' | 'sdr' | 'closer';

/** Inicio de cada usuario del equipo de ventas (no ve el campus). */
export function useTeamHome() {
  const { isSdr, isCloser } = useAuth();
  return isSdr ? '/sdr' : isCloser ? '/closer' : null;
}

export default function RequireAuth({ children, area }: { children: ReactNode; area?: Area }) {
  const { loading, session, profile, isAdmin, isSdr, isCloser, isTeamOnly, logout } = useAuth();
  const location = useLocation();
  const teamHome = useTeamHome();

  if (loading) return <FullScreenMessage loading />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!profile || !profile.active) {
    return (
      <FullScreenMessage
        title="Acceso desactivado"
        text="Tu cuenta no tiene acceso al campus en este momento. Escribinos si creés que es un error."
        action={{ label: 'Cerrar sesión', onClick: logout }}
      />
    );
  }
  if (profile.must_change_password) return <ChangeTempPasswordPage />;

  if (area === 'admin' && !isAdmin) return <Navigate to="/" replace />;
  if (area === 'sdr' && !isSdr && !isAdmin) return <Navigate to="/" replace />;
  if (area === 'closer' && !isCloser && !isAdmin) return <Navigate to="/" replace />;
  // SDRs y closers ven solo su panel.
  if (area === 'campus' && isTeamOnly) {
    if (teamHome) return <Navigate to={teamHome} replace />;
    return (
      <FullScreenMessage
        title="Sin acceso"
        text="Tu usuario del equipo de ventas está dado de baja. Escribile al administrador si creés que es un error."
        action={{ label: 'Cerrar sesión', onClick: logout }}
      />
    );
  }
  return <>{children}</>;
}
