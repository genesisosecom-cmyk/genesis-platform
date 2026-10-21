import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { adminUsers } from '../lib/adminUsers';
import { mmss, TEMP_PASSWORD_SECONDS, useCountdown } from '../lib/useCountdown';
import { ArrowRight } from '../components/Icons';
import FullScreenMessage from '../components/FullScreenMessage';

/** Primer ingreso con contraseña temporal: hay que elegir una propia antes de seguir. */
export default function ChangeTempPasswordPage() {
  const { profile, logout, refreshProfile } = useAuth();
  const left = useCountdown(profile?.temp_password_expires_at, TEMP_PASSWORD_SECONDS);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (left === 0) {
    return (
      <FullScreenMessage
        title="Contraseña temporal vencida"
        text="Tu contraseña temporal duraba 10 minutos y ya venció. Pedile al administrador que te genere una nueva."
        action={{ label: 'Volver al login', onClick: logout }}
      />
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Mínimo 8 caracteres');
    if (password !== confirm) return setError('Las contraseñas no coinciden');
    setError('');
    setSaving(true);
    try {
      await adminUsers({ action: 'change_temp_password', password });
      refreshProfile();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="login">
      <form className="login__card fade-in" onSubmit={onSubmit} noValidate>
        <h1 className="login__brand">Genesis</h1>
        <p className="login__lead">Hola{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}. Elegí tu contraseña para continuar.</p>
        <span className="eyebrow login__timer">Tu acceso temporal vence en {mmss(left)}</span>
        <input className="field" type="password" placeholder="Nueva contraseña" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        <input className="field" type="password" placeholder="Repetir contraseña" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <p className="login__error" role="alert">{error}</p>
        <button className="login__submit" type="submit" disabled={saving} aria-label="Guardar contraseña">
          {saving ? <span className="spinner" /> : <ArrowRight width={26} height={26} />}
        </button>
        <button type="button" className="login__link" onClick={logout}>Cerrar sesión</button>
      </form>
    </div>
  );
}
