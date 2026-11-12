import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { adminUsers } from '../lib/adminUsers';
import { supabase } from '../lib/supabase';
import { ArrowRight } from '../components/Icons';

/** Primer ingreso con contraseña temporal: hay que elegir una propia antes de seguir. */
export default function ChangeTempPasswordPage() {
  const { profile, logout, refreshProfile } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Mínimo 8 caracteres');
    if (password !== confirm) return setError('Las contraseñas no coinciden');
    setError('');
    setSaving(true);
    try {
      await adminUsers({ action: 'change_temp_password', password });
      // Al cambiar la contraseña, Supabase cierra todas las sesiones del usuario (también esta):
      // se vuelve a entrar con la contraseña nueva para que la sesión quede válida.
      if (profile?.email) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: profile.email, password });
        if (signInError) {
          await logout();
          return;
        }
      }
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
