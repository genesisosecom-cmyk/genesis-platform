/** Canal de Discord sin "#" inicial ni espacios, para comparar. */
export const normalizeDiscord = (v: string | null | undefined) => (v ?? '').trim().replace(/^#+/, '').toLowerCase();

/** Valores a buscar con ILIKE (con y sin "#"), con los comodines escapados. */
export function discordVariants(v: string | null | undefined) {
  const base = normalizeDiscord(v).replace(/[\\%_]/g, '\\$&');
  return base ? [base, `#${base}`] : [];
}
