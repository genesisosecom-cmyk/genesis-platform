// Edge Function: gestión de usuarios del campus.
// Usa la service role key (solo disponible en el servidor) para crear, eliminar y
// cambiar contraseñas sin habilitar el registro público.
//
// Acciones de superadmin: create, reset_temp_password, delete.
// Acción del propio usuario: change_temp_password (primer ingreso).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const TEMP_PASSWORD_MINUTES = 10;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Contraseña temporal legible: sin caracteres ambiguos (0/O, 1/l/I). */
function tempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const expiresAt = () => new Date(Date.now() + TEMP_PASSWORD_MINUTES * 60_000).toISOString();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: caller } = await admin.auth.getUser(token);
  if (!caller.user) return json({ error: 'No autenticado' }, 401);

  const { data: me } = await admin
    .from('profiles')
    .select('role, active, must_change_password, temp_password_expires_at')
    .eq('id', caller.user.id)
    .single();
  if (!me) return json({ error: 'Perfil no encontrado' }, 403);

  const body = await req.json().catch(() => ({}));

  // --- El propio usuario reemplaza su contraseña temporal ---
  if (body.action === 'change_temp_password') {
    const password = String(body.password ?? '');
    if (!me.must_change_password) return json({ error: 'No tenés una contraseña temporal pendiente' }, 400);
    if (!me.temp_password_expires_at || new Date(me.temp_password_expires_at) < new Date()) {
      return json({ error: 'La contraseña temporal venció. Pedile una nueva al administrador.' }, 400);
    }
    if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400);
    const { error } = await admin.auth.admin.updateUserById(caller.user.id, { password });
    if (error) return json({ error: error.message }, 400);
    await admin
      .from('profiles')
      .update({ must_change_password: false, temp_password_expires_at: null })
      .eq('id', caller.user.id);
    return json({ ok: true });
  }

  // --- Acciones de superadmin ---
  if (me.role !== 'superadmin' || !me.active || me.must_change_password) return json({ error: 'Sin permisos' }, 403);

  if (body.action === 'create') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const fullName = String(body.full_name ?? '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Email inválido' }, 400);
    const password = tempPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) {
      const exists = /already|registered|exists/i.test(error.message);
      return json({ error: exists ? 'Ya existe un usuario con ese email' : error.message }, 400);
    }
    const expires = expiresAt();
    const role = body.role === 'superadmin' ? 'superadmin' : 'member';
    await admin
      .from('profiles')
      .update({ role, must_change_password: true, temp_password_expires_at: expires })
      .eq('id', data.user.id);
    return json({ id: data.user.id, email, password, expires_at: expires });
  }

  if (body.action === 'reset_temp_password') {
    const userId = String(body.user_id ?? '');
    if (!userId) return json({ error: 'Falta el usuario' }, 400);
    const password = tempPassword();
    const { data, error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return json({ error: error.message }, 400);
    const expires = expiresAt();
    await admin
      .from('profiles')
      .update({ must_change_password: true, temp_password_expires_at: expires })
      .eq('id', userId);
    return json({ id: userId, email: data.user.email, password, expires_at: expires });
  }

  if (body.action === 'delete') {
    const userId = String(body.user_id ?? '');
    if (!userId) return json({ error: 'Falta el usuario' }, 400);
    if (userId === caller.user.id) return json({ error: 'No podés eliminar tu propia cuenta' }, 400);
    // Su progreso se borra en cascada; respuestas y fichas de cliente se conservan sin vínculo.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Acción desconocida' }, 400);
});
