import type { SVGProps } from 'react';

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

type P = SVGProps<SVGSVGElement>;

export const ArrowRight = (p: P) => (
  <svg {...base} {...p}><path d="M4 12h16M14 6l6 6-6 6" /></svg>
);
export const ArrowLeft = (p: P) => (
  <svg {...base} {...p}><path d="M20 12H4M10 6l-6 6 6 6" /></svg>
);
export const Check = (p: P) => (
  <svg {...base} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const Play = (p: P) => (
  <svg {...base} {...p}><path d="M8 5.5v13l11-6.5z" /></svg>
);
export const Chart = (p: P) => (
  <svg {...base} {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
);
export const Layers = (p: P) => (
  <svg {...base} {...p}><path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" /></svg>
);
export const Vault = (p: P) => (
  <svg {...base} {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 12h18" /></svg>
);
export const External = (p: P) => (
  <svg {...base} {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg>
);
export const Logout = (p: P) => (
  <svg {...base} {...p}><path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 16l-4-4 4-4M6 12h11" /></svg>
);

// ---------- Barra lateral del admin ----------
export const Menu = (p: P) => (
  <svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const Home = (p: P) => (
  <svg {...base} {...p}><path d="M4 11l8-7 8 7M6 9.5V20h4v-5h4v5h4V9.5" /></svg>
);
export const Trend = (p: P) => (
  <svg {...base} {...p}><path d="M4 17l5-5 4 4 7-8M15 8h5v5" /></svg>
);
export const Target = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.5" /></svg>
);
export const Bars = (p: P) => (
  <svg {...base} {...p}><path d="M5 20V11M10 20V5M15 20v-6M20 20V9" /></svg>
);
export const Team = (p: P) => (
  <svg {...base} {...p}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0111 0M16 5.2a3 3 0 010 5.6M17.5 14.5a5.5 5.5 0 013 4.5" /></svg>
);
export const Sliders = (p: P) => (
  <svg {...base} {...p}><path d="M5 4v6M5 14v6M12 4v3M12 11v9M19 4v9M19 17v3M3 12h4M10 9h4M17 15h4" /></svg>
);
export const User = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0114 0" /></svg>
);
export const Book = (p: P) => (
  <svg {...base} {...p}><path d="M5 5a2 2 0 012-2h12v15H7a2 2 0 00-2 2zM5 20a2 2 0 002 1h12v-3" /></svg>
);
export const Wrench = (p: P) => (
  <svg {...base} {...p}><path d="M14.5 6.5a4 4 0 015 5L12 19a2.1 2.1 0 01-3-3l7.5-7.5M14.5 6.5L17 4" /></svg>
);
export const Inbox = (p: P) => (
  <svg {...base} {...p}><path d="M4 13l2.5-7h11L20 13v6H4zM4 13h5l1 2h4l1-2h5" /></svg>
);
export const Doc = (p: P) => (
  <svg {...base} {...p}><path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" /></svg>
);
export const Calendar = (p: P) => (
  <svg {...base} {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>
);
export const Wallet = (p: P) => (
  <svg {...base} {...p}><path d="M4 7a2 2 0 012-2h11v4M4 7v11a2 2 0 002 2h14V9H6a2 2 0 01-2-2zM16 14.5h1" /></svg>
);
export const Coins = (p: P) => (
  <svg {...base} {...p}><ellipse cx="9" cy="7" rx="5" ry="2.5" /><path d="M4 7v5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7M10 17.4c.6.1 1.3.1 2 .1 2.8 0 5-1.1 5-2.5v-5M14 9.6c1.7.3 3 1.1 3 2" /></svg>
);
export const Headset = (p: P) => (
  <svg {...base} {...p}><path d="M5 14v-2a7 7 0 0114 0v2M5 14h2v5H5zM17 14h2v5h-2zM19 19a3 3 0 01-3 2h-3" /></svg>
);
export const Phone = (p: P) => (
  <svg {...base} {...p}><path d="M6 3h3l2 5-2.5 1.5a11 11 0 006 6L16 13l5 2v3a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z" /></svg>
);
export const Grid = (p: P) => (
  <svg {...base} {...p}><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></svg>
);
/** Ícono de "órbita" para los estados vacíos. */
export const Orbit = (p: P) => (
  <svg width={64} height={64} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth={2} {...p}>
    <ellipse cx="32" cy="32" rx="26" ry="12" transform="rotate(-35 32 32)" />
    <ellipse cx="32" cy="32" rx="26" ry="12" transform="rotate(35 32 32)" />
    <path d="M32 24c.8 4.4 3.6 7.2 8 8-4.4.8-7.2 3.6-8 8-.8-4.4-3.6-7.2-8-8 4.4-.8 7.2-3.6 8-8z" fill="currentColor" stroke="none" />
  </svg>
);
export const Checklist = (p: P) => (
  <svg {...base} {...p}><path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6.5h9M11 12.5h9M11 18.5h9" /></svg>
);
