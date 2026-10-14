/**
 * Miembros con licencia (solo para la autenticación local de desarrollo).
 * En producción esta lista vive en el backend / proveedor de auth.
 */
export const MEMBERS = [
  { id: 'u_demo', name: 'Miembro Genesis', email: 'demo@genesis.com', password: 'genesis2026' },
];

/** Enlace del botón "Solicitar acceso" en el login. */
export const REQUEST_ACCESS_URL = 'mailto:hola@genesis.com?subject=Solicitud%20de%20acceso';
