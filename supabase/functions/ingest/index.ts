// Edge Function: recibe los eventos de la landing de Génesis (applygenesis.com).
// La landing los reenvía server-to-server con un POST JSON a:
//   /functions/v1/ingest/optin · /visita · /grupo · /aplicacion
// Cada evento es una sola llamada a la función de Postgres ingest_<evento>, que hace
// todo el upsert en una transacción. El log crudo se guarda después de responder.
//
// Pública (desplegar con --no-verify-jwt). Secreto compartido: header X-Genesis-Secret
// contra GENESIS_INGEST_SECRET. Por ahora, si el header no viene se acepta igual y queda
// registrado en ingest_log; si viene con otro valor se rechaza.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const EVENTS = ['optin', 'visita', 'grupo', 'aplicacion'] as const;
type IngestEvent = (typeof EVENTS)[number];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

/** Acepta JSON o texto con JSON adentro (incluso doblemente serializado). */
function parseBody(raw: string): Record<string, unknown> | null {
  let value: unknown = raw;
  for (let i = 0; i < 2 && typeof value === 'string'; i++) {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function checkSecret(req: Request): 'ok' | 'falta' | 'invalido' | 'sin_config' {
  const expected = Deno.env.get('GENESIS_INGEST_SECRET') ?? '';
  const got = req.headers.get('x-genesis-secret');
  if (!expected) return 'sin_config';
  if (got === null || got === '') return 'falta';
  if (got.length !== expected.length) return 'invalido';
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? 'ok' : 'invalido';
}

/** Respuesta de error con la forma que espera cada endpoint. */
const failure = (event: IngestEvent, error: string) =>
  event === 'aplicacion' ? { ok: false, ruta: '', sdr: '', wa: '', error } : { ok: false, error };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const started = Date.now();
  const event = new URL(req.url).pathname.split('/').filter(Boolean).pop() as IngestEvent;
  if (!EVENTS.includes(event)) return json({ ok: false, error: 'Endpoint desconocido' }, 404);
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);

  const secret = checkSecret(req);
  const raw = await req.text().catch(() => '');
  const body = parseBody(raw);

  let status = 200;
  let result: Record<string, unknown>;
  let error: string | null = null;

  if (secret === 'invalido') {
    status = 401;
    result = failure(event, 'Secreto inválido');
  } else if (!body) {
    status = 400;
    result = failure(event, 'Body inválido: se esperaba JSON');
  } else {
    const { data, error: rpcError } = await admin.rpc(`ingest_${event}`, { p: body });
    if (rpcError) {
      status = 500;
      error = rpcError.message;
      result = failure(event, 'Error interno');
    } else {
      result = data as Record<string, unknown>;
      if (result.ok === false) status = 400;
    }
  }

  if (secret === 'falta') console.warn(`ingest/${event}: llegó sin X-Genesis-Secret`);
  if (error) console.error(`ingest/${event}:`, error);

  // El log no demora la respuesta.
  EdgeRuntime.waitUntil(
    admin
      .from('ingest_log')
      .insert({ endpoint: event, secret, payload: body ?? { raw }, status, result, error, ms: Date.now() - started })
      .then(({ error: logError }) => logError && console.error('ingest_log:', logError.message)),
  );

  // `pendiente` es interno (grupo antes del optin): la landing recibe solo { ok: true }.
  if (event === 'grupo' && result.ok) result = { ok: true };
  if (event === 'visita' && result.ok) result = { ok: true };
  return json(result, status);
});
