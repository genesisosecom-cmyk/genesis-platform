import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { ArrowRight } from '../components/Icons';
import FullScreenMessage from '../components/FullScreenMessage';

/** Destino del link de "olvidé mi contraseña": Supabase abre una sesión temporal y acá se define la nueva clave. */
export default function UpdatePasswordPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading) return <FullScreenMessage loading />;
  if (!session) {
    return (
      <FullScreenMessage
        title="Link vencido"
        text="El link para cambiar la contraseña ya no es válido. Pedí uno nuevo desde el login."
        action={{ label: 'Ir al login', onClick: () => navigate('/login') }}
      />
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Mínimo 8 caracteres');
    if (password !== confirm) return setError('Las contraseñas no coinciden');
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) return setError(err.message);
    navigate('/', { replace: true });
  };

  return (
    <div className="login">
      <form className="login__card fade-in" onSubmit={onSubmit} noValidate>
        <h1 className="login__brand">Genesis</h1>
        <p className="muted login__lead">Elegí tu nueva contraseña</p>
        <input className="field" type="password" placeholder="Nueva contraseña" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        <input className="field" type="password" placeholder="Repetir contraseña" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <p className="login__error" role="alert">{error}</p>
        <button className="login__submit" type="submit" disabled={saving} aria-label="Guardar">
          {saving ? <span className="spinner" /> : <ArrowRight width={26} height={26} />}
        </button>
      </form>
    </div>
  );
}
