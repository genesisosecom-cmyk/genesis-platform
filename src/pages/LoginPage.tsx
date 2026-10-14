import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ArrowRight } from '../components/Icons';
import { REQUEST_ACCESS_URL } from '../data/members';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (user) return <Navigate to={from} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return setError('Completá email y contraseña');
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch {
      setError('Email o contraseña incorrectos');
      setLoading(false);
    }
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
        <input
          className="field"
          type="password"
          placeholder="Contraseña"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="login__error" role="alert">{error}</p>
        <button className="login__submit" type="submit" disabled={loading} aria-label="Ingresar">
          {loading ? <span className="spinner" /> : <ArrowRight width={26} height={26} />}
        </button>
        <a className="login__request" href={REQUEST_ACCESS_URL}>Solicitar acceso</a>
        <span className="eyebrow login__note">Solo miembros con licencia</span>
      </form>
    </div>
  );
}
