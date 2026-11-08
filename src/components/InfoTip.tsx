import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const MARGIN = 12;
const WIDTH = 260;

/**
 * Ícono ⓘ con una explicación corta. Se abre al pasar el cursor (compu) o al tocarlo (celular);
 * se cierra tocando afuera, con Escape o al hacer scroll. El globo va en un portal con
 * posición fija para que no lo recorten las tablas ni las tarjetas.
 */
export default function InfoTip({ text, label = 'Qué significa' }: { text: ReactNode; label?: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(WIDTH, vw - MARGIN * 2);
    const left = Math.min(Math.max(MARGIN, r.left + r.width / 2 - width / 2), vw - width - MARGIN);
    const h = tip.current?.offsetHeight ?? 60;
    const above = r.bottom + 8 + h > window.innerHeight - MARGIN && r.top - 8 - h > MARGIN;
    setPos({ top: above ? r.top - 8 - h : r.bottom + 8, left, above });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      if (e.type === 'pointerdown' && (btn.current?.contains(e.target as Node) || tip.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`infotip${open ? ' is-open' : ''}`}
        aria-label={label}
        aria-expanded={open}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
        onClick={(e) => {
          // Dentro de filas o cabeceras clickeables: que no abra la tarjeta.
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        ⓘ
      </button>
      {open &&
        createPortal(
          <div
            ref={tip}
            role="tooltip"
            className="infotip__bubble"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: Math.min(WIDTH, window.innerWidth - MARGIN * 2) }}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Título con su ⓘ al lado. */
export function WithTip({ children, tip }: { children: ReactNode; tip?: ReactNode }) {
  if (!tip) return <>{children}</>;
  return (
    <span className="with-tip">
      {children}
      <InfoTip text={tip} />
    </span>
  );
}
