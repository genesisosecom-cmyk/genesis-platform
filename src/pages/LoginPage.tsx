import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ArrowRight } from '../components/Icons';
import { REQUEST_ACCESS_URL } from '../config';
import { isSupabaseConfigured } from '../lib/supabase';

export default function LoginPage() {
  const { session, loading: authLoading, login, sendPasswordReset } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (!authLoading && session) return <Navigate to={from} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!isSupabaseConfigured) return setError('Falta configurar Supabase (.env)');
    if (!email || (mode === 'login' && !password)) {
      return setError(mode === 'login' ? 'Completá email y contraseña' : 'Ingresá tu email');
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await sendPasswordReset(email);
        setInfo('Si el email está registrado, te llegará un link para crear una nueva contraseña.');
      }
    } catch {
      setError(mode === 'login' ? 'Email o contraseña incorrectos' : 'No pudimos enviar el email. Probá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'reset' : 'login');
    setError('');
    setInfo('');
  };

  return (
    <div className="login">
      <form className="login__card fade-in" onSubmit={onSubmit} noValidate>
        <h1 className="login__brand">Genesis</h1>
        <input
          className="field"
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        {mode === 'login' && (
          <input
            className="field"
            type="password"
            placeholder="Contraseña"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        <p className={info ? 'login__info' : 'login__error'} role="alert">{error || info}</p>
        <button className="login__submit" type="submit" disabled={loading} aria-label={mode === 'login' ? 'Ingresar' : 'Enviar link'}>
          {loading ? <span className="spinner" /> : <ArrowRight width={26} height={26} />}
        </button>
        <button type="button" className="login__link" onClick={switchMode}>
          {mode === 'login' ? '¿Olvidaste tu contraseña?' : 'Volver a ingresar'}
        </button>
        <a className="login__request" href={REQUEST_ACCESS_URL}>Solicitar acceso</a>
        <span className="eyebrow login__note">Solo miembros con licencia</span>
      </form>
    </div>
  );
}
