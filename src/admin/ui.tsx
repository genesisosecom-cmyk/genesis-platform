import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Portal a <body>: si el modal queda dentro de un contenedor animado/con blur,
  // `position: fixed` se recorta a ese contenedor en vez de cubrir la pantalla.
  return createPortal(
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal__panel glass fade-in${wide ? ' modal__panel--wide' : ''}`}>
        <header className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={`afield${full ? ' afield--full' : ''}`}>
      <span className="afield__label">{label}</span>
      {children}
    </label>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'warn' | 'ok' }) {
  return (
    <div className={`glass kpi${tone ? ` kpi--${tone}` : ''}`}>
      <span className="eyebrow">{label}</span>
      <span className="kpi__value">{value}</span>
      {hint && <span className="muted kpi__hint">{hint}</span>}
    </div>
  );
}

export function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'muted' | 'accent'; children: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export function State({ loading, error, empty, children }: { loading: boolean; error: string | null; empty?: boolean; children: ReactNode }) {
  if (loading) return <div className="state"><span className="spinner" /></div>;
  if (error) return <div className="state state--error">Error: {error}</div>;
  if (empty) return <div className="state muted">Todavía no hay datos.</div>;
  return <>{children}</>;
}
