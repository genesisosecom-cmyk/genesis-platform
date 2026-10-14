/**
 * Capa de autenticación.
 *
 * Esta implementación local valida contra la lista de miembros en
 * `src/data/members.ts` y guarda la sesión en localStorage. Sirve para
 * desarrollo y demos: al ser 100% client-side NO es segura para producción.
 * Para producción reemplazá `login`, `logout` y `getSession` por un proveedor
 * real (Supabase Auth, Firebase, Clerk, etc.) manteniendo la misma interfaz.
 */
import { MEMBERS } from '../data/members';

export interface User {
  id: string;
  name: string;
  email: string;
}

const SESSION_KEY = 'genesis.session';

export class AuthError extends Error {}

export async function login(email: string, password: string): Promise<User> {
  // Pequeña demora para que la UI muestre el estado de carga como con un backend real.
  await new Promise((r) => setTimeout(r, 450));
  const member = MEMBERS.find((m) => m.email.toLowerCase() === email.trim().toLowerCase());
  if (!member || member.password !== password) {
    throw new AuthError('Credenciales inválidas');
  }
  const user: User = { id: member.id, name: member.name, email: member.email };
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

export async function logout(): Promise<void> {
  localStorage.removeItem(SESSION_KEY);
}

export function getSession(): User | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}
