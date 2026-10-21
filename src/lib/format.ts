const dateFmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Fechas `YYYY-MM-DD` se interpretan en hora local (no UTC) para no correrse un día. */
function parse(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

export const fmtDate = (v: string | null | undefined) => (v ? dateFmt.format(parse(v)) : '—');
export const fmtDateTime = (v: string | null | undefined) => (v ? dateTimeFmt.format(parse(v)) : '—');

export function fmtMoney(amount: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('es-AR')}`;
  }
}

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function addMonthsISO(iso: string, months: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1 + months, 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(d, last));
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function relativeTime(v: string | null) {
  if (!v) return 'Nunca';
  const diff = (Date.now() - new Date(v).getTime()) / 1000;
  if (diff < 60) return 'Recién';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 30) return `Hace ${Math.floor(diff / 86400)} d`;
  return fmtDate(v);
}
