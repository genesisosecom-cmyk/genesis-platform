import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import FullScreenMessage from '../components/FullScreenMessage';

export default function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { loading, session, profile, isAdmin, logout } = useAuth();
  const location = useLocation();

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
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
