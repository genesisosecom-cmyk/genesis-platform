// Edge Function: alta de usuarios del campus por el superadmin.
// Usa la service role key (solo disponible en el servidor) para crear cuentas
// sin habilitar el registro público.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Verifica que quien llama sea superadmin.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: caller } = await admin.auth.getUser(token);
  if (!caller.user) return json({ error: 'No autenticado' }, 401);
  const { data: profile } = await admin
    .from('profiles')
    .select('role, active')
    .eq('id', caller.user.id)
    .single();
  if (profile?.role !== 'superadmin' || !profile.active) return json({ error: 'Sin permisos' }, 403);

  const body = await req.json().catch(() => ({}));

  if (body.action === 'create') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const fullName = String(body.full_name ?? '').trim();
    if (!email || password.length < 8) {
      return json({ error: 'Email y contraseña (mínimo 8 caracteres) son obligatorios' }, 400);
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) return json({ error: error.message }, 400);
    return json({ id: data.user.id });
  }

  if (body.action === 'set_password') {
    const password = String(body.password ?? '');
    if (!body.user_id || password.length < 8) return json({ error: 'Datos inválidos' }, 400);
    const { error } = await admin.auth.admin.updateUserById(body.user_id, { password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Acción desconocida' }, 400);
});
