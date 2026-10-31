// Prueba de punta a punta de los endpoints de la landing (/optin, /visita, /grupo, /aplicacion).
//
//   GENESIS_INGEST_SECRET=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/test-ingest.mjs https://zanwrwysbmvgytfzymaz.supabase.co/functions/v1/ingest/optin
//
// Hace POST de ejemplo con emails test+<timestamp>…@genesis.test, verifica las respuestas y,
// con SUPABASE_SERVICE_ROLE_KEY, lo que quedó guardado en la base. Al final borra los datos de prueba.
// Sin la service role key solo chequea las respuestas e imprime el tag para limpiar a mano.
import { createClient } from '@supabase/supabase-js';

const base = process.argv[2];
if (!base || !/\/optin\/?$/.test(base)) {
  console.error('Uso: node scripts/test-ingest.mjs <URL que termina en /optin>');
  process.exit(1);
}
const url = (event) => base.replace(/\/optin\/?$/, `/${event}`);
const secret = process.env.GENESIS_INGEST_SECRET ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const supabaseUrl = process.env.SUPABASE_URL ?? new URL(base).origin;
const db = serviceKey ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }) : null;

const ts = Date.now();
const tag = `test+${ts}`;
const mail = (who) => `${tag}-${who}@genesis.test`;
const phone = (n) => `+549${String(ts).slice(-8)}${n}`;
const digits = (p) => p.replace(/\D/g, '');
const SOURCE = `test-${ts}`; // fuente única para poder borrar las visitas de prueba

let failed = 0;
const timings = [];
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? `\n    ${detail}` : ''}`);
}

async function post(event, body, { text = false, headers = {} } = {}) {
  const t0 = Date.now();
  const res = await fetch(url(event), {
    method: 'POST',
    headers: {
      'Content-Type': text ? 'text/plain' : 'application/json',
      ...(secret ? { 'X-Genesis-Secret': secret } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  timings.push({ event, ms });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, ms };
}

/** Mismo reparto que el servidor: h = (h*31 + charCode) >>> 0. */
function expectedSdr(key) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ['Mati', 'Santi'][h % 2];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function leadByEmail(email) {
  const { data, error } = await db.from('leads').select('*, lead_launches(*), lead_events(*)').eq('email', email).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function main() {
  console.log(`Base: ${base}\nTag: ${tag}\n`);

  // --- CORS ---
  const pre = await fetch(url('optin'), { method: 'OPTIONS' });
  check('OPTIONS responde con CORS abierto', pre.ok && pre.headers.get('access-control-allow-origin') === '*');

  // --- /visita ---
  const tracking1 = { utm_source: SOURCE, utm_medium: 'cpc', ab: '1' };
  const v1 = await post('visita', { tracking: tracking1 });
  const v2 = await post('visita', { tracking: tracking1 }, { text: true });
  check('/visita responde { ok: true } (JSON y texto)', v1.json?.ok === true && v2.json?.ok === true && Object.keys(v2.json).length === 1);

  // --- /optin ---
  const A = { email: mail('a'), telefono: phone(1) };
  const o1 = await post('optin', {
    nombre: 'Test A', ...A, inversion_meta: 'De 100 a 200 dólares', califica: 'No', variant: '1',
    tracking: { ...tracking1, fbclid: 'abc' },
  });
  check('/optin nuevo → repetido: false', o1.status === 200 && o1.json?.ok && o1.json.repetido === false && o1.json.id, JSON.stringify(o1));

  const o2 = await post('optin', {
    nombre: 'Test A', ...A, inversion_meta: 'De 500 a 1.000 dólares', califica: 'Sí', variant: '3',
    tracking: { utm_source: 'facebook' },
  }, { text: true });
  check('/optin repetido (body como texto) → mismo id, repetido: true', o2.json?.id === o1.json?.id && o2.json?.repetido === true, JSON.stringify(o2));

  const o3 = await post('optin', { nombre: `Sin datos ${tag}` });
  check('/optin sin email ni teléfono → 400', o3.status === 400 && o3.json?.ok === false);

  // --- /grupo antes que el optin ---
  const B = { email: mail('b'), telefono: phone(2) };
  const g1 = await post('grupo', { email: B.email });
  check('/grupo antes del optin → { ok: true }', g1.json?.ok === true && Object.keys(g1.json).length === 1, JSON.stringify(g1));
  await sleep(1500);
  const ob = await post('optin', { nombre: 'Test B', ...B, inversion_meta: 'Menos de 100 dólares', califica: 'Sí', variant: '2', tracking: { utm_source: 'instagram', utm_medium: 'bio', ab: '2' } });
  check('/optin de B', ob.json?.ok && ob.json.repetido === false);

  // --- /grupo después del optin ---
  const g2 = await post('grupo', { email: A.email });
  check('/grupo de A', g2.json?.ok === true);

  // --- /aplicacion con optin previo (escribe otro email) ---
  const ap1 = await post('aplicacion', {
    nombre: 'Test A', email: mail('a-otro'), telefono: A.telefono,
    objetivo: 'Escalar', freno: 'Tiempo', hace_cuanto: '1 año', conoce_manu: 'Sí', por_que_ahora: 'Ya',
    ciclo: 'Corto', facturacion: 'USD 10k', inversion: 'Entre USD 3.000 y USD 6.000',
    optin: { email: A.email, telefono: A.telefono }, tracking: { utm_source: SOURCE }, tracking_link: { utm_source: 'whatsapp', utm_medium: 'grupo' },
  });
  const sdrA = expectedSdr(A.email);
  check(`/aplicacion de A → aplicado, SDR ${sdrA}`, ap1.json?.ok && ap1.json.ruta === 'aplicado' && ap1.json.sdr === sdrA && /^https:\/\//.test(ap1.json.wa), JSON.stringify(ap1));

  // --- /aplicacion sin optin previo ---
  const C = { email: mail('c'), telefono: phone(3) };
  const ap2 = await post('aplicacion', { nombre: 'Test C', ...C, inversion: 'Más de USD 6.000', optin: {}, tracking: {}, tracking_link: {} });
  const sdrC = expectedSdr(C.email);
  check(`/aplicacion sin optin → aplicado, SDR ${sdrC}`, ap2.json?.ruta === 'aplicado' && ap2.json.sdr === sdrC, JSON.stringify(ap2));

  // --- /aplicacion rechazada ---
  const ap3 = await post('aplicacion', { nombre: 'Test B', email: B.email, telefono: B.telefono, inversion: 'Menos de USD 1.000', optin: { email: B.email } });
  check('/aplicacion "Menos de USD 1.000" → rechazado sin SDR', ap3.json?.ruta === 'rechazado' && ap3.json.sdr === '' && ap3.json.wa === '', JSON.stringify(ap3));

  // --- Secreto inválido ---
  if (secret) {
    const bad = await post('visita', { tracking: tracking1 }, { headers: { 'X-Genesis-Secret': 'incorrecto' } });
    check('Secreto inválido → 401', bad.status === 401);
  }

  const slowest = timings.reduce((a, b) => (b.ms > a.ms ? b : a));
  const sorted = timings.map((t) => t.ms).sort((a, b) => a - b);
  console.log(`\nTiempos: mediana ${sorted[Math.floor(sorted.length / 2)]} ms · máximo ${slowest.ms} ms (${slowest.event})`);
  check('Todas las respuestas en menos de 1 segundo', slowest.ms < 1000, `${slowest.event}: ${slowest.ms} ms`);

  if (!db) {
    console.log(`\nSin SUPABASE_SERVICE_ROLE_KEY: no se verificó la base ni se borraron los datos (tag ${tag}).`);
    return;
  }

  // --- Verificación en la base ---
  console.log('');
  const a = await leadByEmail(A.email);
  const la = a?.lead_launches?.[0];
  check('A: un solo lead, con teléfono normalizado', a && a.phone === digits(A.telefono) && a.lead_launches.length === 1);
  check('A: datos del primer optin (versión, fuente, tracking) y optin_count 2',
    la?.variant === '1' && la.source === `Test-${ts} · cpc` && la.tracking?.fbclid === 'abc' && la.optin_count === 2, JSON.stringify(la));
  check('A: inversión y califica recalculadas con el último optin', la?.inversion_meta === 'De 500 a 1.000 dólares' && la.califica === true);
  check('A: tocó el grupo', la?.toco_grupo === true && la.toco_grupo_at);
  check(`A: aplicó, SDR ${sdrA}, estado "Nuevo lead", etapa "Nuevo"`,
    a?.sdr === sdrA && la?.route === 'aplicado' && la.post_class_status === 'Nuevo lead' && la.stage === 'Nuevo' && la.application?.objetivo === 'Escalar');
  check('A: el email del optin no se pisó y el distinto quedó en el historial',
    a?.email === A.email && a.lead_events.some((e) => e.kind === 'dato_distinto' && e.summary.includes(mail('a-otro'))));
  const kindsA = a?.lead_events.map((e) => e.kind).sort().join(',');
  check('A: historial completo', kindsA === 'aplicacion,dato_distinto,grupo,optin,optin_repetido', kindsA);

  const b = await leadByEmail(B.email);
  const lb = b?.lead_launches?.[0];
  check('B: /grupo anterior al optin quedó aplicado', lb?.toco_grupo === true && b.lead_events.some((e) => e.kind === 'grupo'));
  check('B: califica recalculada en el servidor (mandó "Sí" con menos de 100)', lb?.califica === false);
  check('B: fuente "Instagram · bio"', lb?.source === 'Instagram · bio');
  check('B: rechazado → etapa "Próximo ciclo", sin SDR', lb?.route === 'rechazado' && lb.stage === 'Próximo ciclo' && !b.sdr && lb.post_class_status === null);
  const { data: pend } = await db.from('lead_pending_events').select('*').eq('email', B.email);
  check('B: el evento pendiente quedó marcado como aplicado', pend?.length === 1 && pend[0].applied_at && pend[0].lead_id === b?.id);

  const c = await leadByEmail(C.email);
  const lc = c?.lead_launches?.[0];
  check('C: creado como posible duplicado, aplicado, sin optin', c?.possible_duplicate === true && lc?.route === 'aplicado' && lc.optin_at === null && c.sdr === sdrC);

  const { data: visits } = await db.from('landing_visits').select('*').eq('source', `Test-${ts} · cpc`);
  check('Visitas: 2 en la versión 1 para la fuente de prueba', visits?.length === 1 && visits[0].visits === 2 && visits[0].variant === '1', JSON.stringify(visits));

  const { data: logs } = await db.from('ingest_log').select('endpoint, secret, status').like('payload->>email', `${tag}%`);
  check('ingest_log registra los requests', (logs?.length ?? 0) >= 6);
}

async function cleanup() {
  if (!db) return;
  const like = `${tag}%`;
  const steps = [
    db.from('leads').delete().like('email', like),
    db.from('lead_pending_events').delete().like('email', like),
    db.from('landing_visits').delete().like('source', `Test-${ts}%`),
    db.from('ingest_log').delete().like('payload->>email', like),
    db.from('ingest_log').delete().like('payload->tracking->>utm_source', SOURCE),
    db.from('ingest_log').delete().like('payload->>nombre', `Sin datos ${tag}`),
  ];
  for (const s of steps) {
    const { error } = await s;
    if (error) console.error('Error al limpiar:', error.message);
  }
  console.log('\nDatos de prueba borrados.');
}

try {
  await main();
} catch (e) {
  failed++;
  console.error(e);
} finally {
  await cleanup();
}
console.log(failed ? `\n${failed} chequeo(s) fallaron.` : '\nTodo OK.');
process.exit(failed ? 1 : 0);
