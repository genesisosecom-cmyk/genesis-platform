import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useRealtime } from '../lib/realtime';

const STORAGE_KEY = 'lead-sound';
const EVENT = 'lead-sound-change';

/** Preferencia de este navegador: el sonido viene prendido. */
function readOn() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function useLeadSoundPref() {
  const [on, setOn] = useState(readOn);
  useEffect(() => {
    const sync = () => setOn(readOn());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const toggle = () => {
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'off' : 'on');
    } catch {
      /* sin storage: queda como estaba */
    }
    window.dispatchEvent(new Event(EVENT));
    // Al prenderlo suena una vez, para que se escuche cómo es.
    if (!on) playKaching();
  };
  return { on, toggle };
}

let audio: HTMLAudioElement | null = null;
function getAudio() {
  if (!audio) {
    const a = new Audio();
    // Safari en iPhone no reproduce Ogg Opus: usa el mp3.
    a.src = a.canPlayType('audio/ogg; codecs="opus"') ? '/sounds/kaching.ogg' : '/sounds/kaching.mp3';
    a.preload = 'auto';
    audio = a;
  }
  return audio;
}

export function playKaching() {
  const a = getAudio();
  a.currentTime = 0;
  a.play().catch(() => {
    /* el navegador lo bloquea hasta que la persona toque la página */
  });
}

/**
 * «Ka-ching» cada vez que entra un lead nuevo (insert en lead_launches: optin de la landing o
 * carga manual). Escucha para el superadmin, las SDR y los closers; la base solo les manda los
 * leads que pueden ver. Si llegan varios juntos, suena una vez.
 */
export default function NewLeadSound() {
  const { isAdmin, isSdr, isCloser } = useAuth();
  const { on } = useLeadSoundPref();
  const enabled = on && (isAdmin || isSdr || isCloser);
  const unlocked = useRef(false);

  // Los navegadores no dejan sonar audio hasta la primera interacción: se "desbloquea" con el primer toque.
  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      if (unlocked.current) return;
      unlocked.current = true;
      const a = getAudio();
      a.muted = true;
      a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => undefined).finally(() => { a.muted = false; });
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [enabled]);

  useRealtime([{ table: 'lead_launches', event: 'INSERT' }], playKaching, { delayMs: 300, enabled });
  return null;
}

/** Botón para prender o apagar el sonido en este navegador. */
export function LeadSoundToggle({ className = 'icon-btn' }: { className?: string }) {
  const { isAdmin, isSdr, isCloser } = useAuth();
  const { on, toggle } = useLeadSoundPref();
  if (!(isAdmin || isSdr || isCloser)) return null;
  const label = on ? 'Sonido de leads nuevos: prendido (tocá para apagarlo)' : 'Sonido de leads nuevos: apagado (tocá para prenderlo)';
  return (
    <button type="button" className={className} onClick={toggle} aria-label={label} title={label} aria-pressed={on}>
      <span aria-hidden="true">{on ? '🔔' : '🔕'}</span>
    </button>
  );
}
