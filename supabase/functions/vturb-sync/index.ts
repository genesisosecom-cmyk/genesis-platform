// Edge Function: trae las métricas del VSL desde la API de Analytics de vTurb y las guarda en
// vsl_daily (una fila por player y día de Argentina). La llama pg_cron una vez por hora con la
// clave de private.vsl_cron_key; un superadmin también puede llamarla (botón «Actualizar vTurb»).
//
// Secret: VTURB_API_TOKEN (vTurb → Settings → Analytics API → Generate New API Key).
// El token nunca sale de acá: no va en respuestas, errores ni logs (todo pasa por redact()).
//
// API documentada en https://vturb.gitbook.io/analytics-api/analytics (base https://analytics.vturb.net,
// headers X-Api-Token y X-Api-Version: v1). Rutas usadas:
//   GET  /players/list               duración y segundo del pitch de cada player
//   POST /sessions/stats_by_day      plays (total_started), vistas, terminaron, clicks, sobre el pitch, por día
//   POST /sessions/stats             lo mismo para un rango con hora (primer play y control del player viejo)
//   POST /times/user_engagement      tiempo promedio visto y curva por segundo (grouped_timed)
//
// Acciones (POST, JSON):
//   { action: 'sync' }                                   → corrida normal (la de pg_cron)
//   { action: 'stats', player_id, desde, hasta }         → números de vTurb de un rango (fechas ISO), para verificar
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

const API = 'https://analytics.vturb.net';
const TZ = 'America/Argentina/Buenos_Aires';
const AR_OFFSET_MS = 3 * 3600_000; // Argentina: UTC-3 todo el año.
const DAY_MS = 86_400_000;
const BACKFILL_MAX_DAYS = 60;
const RECENT_DAYS = 2; // cada hora se vuelven a pedir hoy y los 2 días anteriores

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const TOKEN = (Deno.env.get('VTURB_API_TOKEN') ?? '').trim();

function redact(text: string) {
  let t = String(text ?? '');
  if (TOKEN) t = t.split(TOKEN).join('…');
  return t;
}

class VturbError extends Error {}

let calls = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function vt<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>, query?: Record<string, string>): Promise<T> {
  const url = `${API}${path}${query ? `?${new URLSearchParams(query)}` : ''}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    calls++;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { 'X-Api-Token': TOKEN, 'X-Api-Version': 'v1', 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      });
    } catch (e) {
      throw new VturbError(redact(`No se pudo conectar con vTurb: ${(e as Error).message}`));
    }
    if (res.status === 429 && attempt < 2) {
      await sleep(3000 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new VturbError(redact(`vTurb respondió ${res.status} en ${path}: ${text.slice(0, 300)}`));
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new VturbError(`vTurb devolvió algo que no es JSON en ${path}`);
    }
  }
  throw new VturbError(`vTurb: demasiados pedidos (429) en ${path}`);
}

// ---------- Fechas (Argentina) ----------

/** Fecha y hora de Argentina como texto «YYYY-MM-DD HH:MM:SS». */
const arText = (d: Date) => new Date(d.getTime() - AR_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
const arDay = (d: Date) => arText(d).slice(0, 10);
const dayStart = (day: string) => new Date(`${day}T00:00:00-03:00`);
const addDays = (day: string, n: number) => arDay(new Date(dayStart(day).getTime() + n * DAY_MS + 12 * 3600_000));
const daysBetween = (a: string, b: string) => {
  const out: string[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
};

// ---------- Tipos de vTurb (según la documentación) ----------

interface VtPlayer { id: string; name: string; pitch_time: number; duration: number; created_at: string }
interface VtStats {
  total_viewed?: number; total_viewed_device_uniq?: number; total_viewed_session_uniq?: number;
  total_started?: number; total_started_device_uniq?: number; total_started_session_uniq?: number;
  total_finished?: number; total_clicked?: number;
  total_over_pitch?: number; total_under_pitch?: number; over_pitch_rate?: number;
  total_conversions?: number; engagement_rate?: number; play_rate?: number;
  date_key?: string;
}
interface VtEngagement { average_watched_time: number; engagement_rate: number; grouped_timed: { timed: number; total_users: number }[] }

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v ?? 0) || 0);

interface PlayerRow {
  player_id: string; nombre: string; desde: string | null; hasta: string | null; desde_fuente: string;
  duracion_seg: number | null; pitch_seg: number | null;
}

function statsBody(p: PlayerRow, from: string, to: string) {
  const b: Record<string, unknown> = { player_id: p.player_id, start_date: from, end_date: to, timezone: TZ };
  if (p.duracion_seg) b.video_duration = p.duracion_seg;
  if (p.pitch_seg) b.pitch_time = p.pitch_seg;
  return b;
}

/** Reproducciones (total_started) entre dos momentos, con hora. */
async function playsBetween(p: PlayerRow, from: Date, to: Date) {
  const s = await vt<VtStats>('POST', '/sessions/stats', statsBody(p, arText(from), arText(to)));
  return n(s.total_started);
}

/**
 * ¿vTurb respeta la hora en start_date/end_date (y la interpreta en hora Argentina)?
 * Se parte un día con plays en dos mitades: si respeta la hora, las mitades suman el día y el
 * día entero coincide con stats_by_day; si solo mira la fecha, cada mitad devuelve el día entero.
 */
const timeSupport = new Map<string, boolean | null>();
async function honorsTime(p: PlayerRow, day: string, dayPlays: number): Promise<boolean | null> {
  const key = `${p.player_id}|${day}`;
  if (timeSupport.has(key)) return timeSupport.get(key)!;
  if (dayPlays <= 0) return null;
  const s = dayStart(day);
  const full = await playsBetween(p, s, new Date(s.getTime() + DAY_MS - 1000));
  const a = await playsBetween(p, s, new Date(s.getTime() + DAY_MS / 2 - 1000));
  const b = await playsBetween(p, new Date(s.getTime() + DAY_MS / 2), new Date(s.getTime() + DAY_MS - 1000));
  const ok = full === dayPlays && a + b === full && (a < full || b < full);
  timeSupport.set(key, ok);
  return ok;
}

// ---------- Sync ----------

async function syncPlayer(db: SupabaseClient, p: PlayerRow, log: string[]) {
  const today = arDay(new Date());
  const { data: last } = await db.from('vsl_daily').select('dia').eq('player_id', p.player_id).order('dia', { ascending: false }).limit(1).maybeSingle();
  const first = p.desde ? arDay(new Date(p.desde)) : addDays(today, -BACKFILL_MAX_DAYS);
  let start = last?.dia ? addDays(last.dia as string, -RECENT_DAYS) : first;
  if (start < addDays(today, -BACKFILL_MAX_DAYS)) start = addDays(today, -BACKFILL_MAX_DAYS);
  if (start > addDays(today, -RECENT_DAYS)) start = addDays(today, -RECENT_DAYS);

  const rows = await vt<VtStats[]>('POST', '/sessions/stats_by_day', statsBody(p, `${start} 00:00:00`, `${today} 23:59:59`));
  const byDay = new Map<string, VtStats>();
  for (const r of Array.isArray(rows) ? rows : []) if (r.date_key) byDay.set(String(r.date_key).slice(0, 10), r);

  const { data: stored } = await db.from('vsl_daily').select('dia, plays, curva').eq('player_id', p.player_id).gte('dia', start);
  const hadCurve = new Map((stored ?? []).map((r) => [r.dia as string, { plays: r.plays as number, curva: r.curva !== null }]));

  const upserts: Record<string, unknown>[] = [];
  for (const day of daysBetween(start, today)) {
    const s = byDay.get(day) ?? {};
    const plays = n(s.total_started);
    const row: Record<string, unknown> = {
      player_id: p.player_id, dia: day,
      plays, plays_unicos: n(s.total_started_device_uniq),
      vistas: n(s.total_viewed), vistas_unicas: n(s.total_viewed_device_uniq),
      terminaron: n(s.total_finished), clicks: n(s.total_clicked),
      sobre_pitch: n(s.total_over_pitch), bajo_pitch: n(s.total_under_pitch),
      conversiones: n(s.total_conversions),
      play_rate_vturb: s.play_rate ?? null, engagement_vturb: s.engagement_rate ?? null,
      raw: s, fetched_at: new Date().toISOString(),
    };
    // Curva y tiempo promedio: solo días con plays; los viejos solo si cambiaron o no se pidieron.
    const prev = hadCurve.get(day);
    const needCurve = plays > 0 && p.duracion_seg && (!prev || !prev.curva || prev.plays !== plays || day >= addDays(today, -1));
    if (needCurve) {
      const e = await vt<VtEngagement>('POST', '/times/user_engagement', {
        player_id: p.player_id, video_duration: p.duracion_seg, start_date: `${day} 00:00:00`, end_date: `${day} 23:59:59`, timezone: TZ,
      });
      row.promedio_visto_seg = e.average_watched_time ?? null;
      row.curva = (e.grouped_timed ?? []).map((g) => [n(g.timed), n(g.total_users)]).sort((a, b) => a[0] - b[0]);
    } else if (plays === 0) {
      row.promedio_visto_seg = null;
      row.curva = null;
    }
    upserts.push(row);
  }
  const { error } = await db.from('vsl_daily').upsert(upserts, { onConflict: 'player_id,dia' });
  if (error) throw new Error(`No se pudo guardar vsl_daily: ${error.message}`);
  log.push(`${p.nombre}: ${start} a ${today}, ${upserts.reduce((a, r) => a + (r.plays as number), 0)} plays`);
  return byDay;
}

/** Primer play del player después de la hora del merge (resolución: minuto). */
async function firstPlay(p: PlayerRow, byDay: Map<string, VtStats>): Promise<{ at: Date | null; why: string }> {
  if (!p.desde) return { at: null, why: 'sin fecha de inicio' };
  const from = new Date(p.desde);
  const day = arDay(from);
  const ok = await honorsTime(p, day, n(byDay.get(day)?.total_started));
  if (!ok) return { at: null, why: ok === null ? 'todavía sin plays ese día' : 'vTurb solo da días, no horas' };
  const limit = Math.min(Date.now(), from.getTime() + DAY_MS);
  const total = await playsBetween(p, from, new Date(limit));
  if (total === 0) return { at: null, why: 'sin plays después de la publicación' };
  // Búsqueda binaria del primer minuto con plays.
  let lo = 0, hi = Math.ceil((limit - from.getTime()) / 60_000);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const c = await playsBetween(p, from, new Date(from.getTime() + (mid + 1) * 60_000 - 1000));
    if (c > 0) hi = mid; else lo = mid + 1;
  }
  return { at: new Date(from.getTime() + lo * 60_000), why: 'ok' };
}

/** Plays del player después de su «hasta» (no debería haber: la landing ya usa otro). */
async function playsAfter(p: PlayerRow, byDay: Map<string, VtStats>): Promise<number | null> {
  if (!p.hasta) return null;
  const hasta = new Date(p.hasta);
  const day = arDay(hasta);
  let afterDays = 0;
  for (const [d, s] of byDay) if (d > day) afterDays += n(s.total_started);
  const ok = await honorsTime(p, day, n(byDay.get(day)?.total_started));
  if (ok) return playsBetween(p, hasta, new Date());
  // Sin hora: solo se pueden contar los días enteros posteriores.
  return afterDays;
}

async function runSync(db: SupabaseClient) {
  const log: string[] = [];
  const { data: players, error } = await db.from('vsl_players').select('player_id, nombre, desde, hasta, desde_fuente, duracion_seg, pitch_seg').order('sort');
  if (error) throw new Error(error.message);

  // Duración y pitch desde vTurb.
  const list = await vt<VtPlayer[]>('GET', '/players/list');
  const info = new Map((Array.isArray(list) ? list : []).map((x) => [x.id, x]));
  for (const p of (players ?? []) as PlayerRow[]) {
    const i = info.get(p.player_id);
    if (!i) {
      log.push(`${p.nombre}: el player no aparece en players/list de esta cuenta`);
      continue;
    }
    if (i.duration && i.duration !== p.duracion_seg) p.duracion_seg = Math.round(i.duration);
    if (i.pitch_time !== undefined && i.pitch_time !== p.pitch_seg) p.pitch_seg = Math.round(i.pitch_time);
    await db.from('vsl_players').update({ duracion_seg: p.duracion_seg, pitch_seg: p.pitch_seg }).eq('player_id', p.player_id);
  }

  for (const p of (players ?? []) as PlayerRow[]) {
    const byDay = await syncPlayer(db, p, log);
    const patch: Record<string, unknown> = { sincronizado_at: new Date().toISOString() };

    if (p.desde_fuente === 'merge') {
      const fp = await firstPlay(p, byDay);
      if (fp.at) {
        const { data: moved } = await db.rpc('vsl_set_primer_play', { p_player: p.player_id, p_at: fp.at.toISOString() });
        log.push(`${p.nombre}: primer play ${arText(fp.at)} (Argentina)${moved ? ' → nuevo inicio del período' : ' (fuera de las 24 h siguientes a la publicación: no se usó)'}`);
      } else {
        log.push(`${p.nombre}: primer play sin hora exacta (${fp.why}); queda la hora de publicación`);
      }
    }
    // Releer «hasta» por si el primer play del siguiente lo movió.
    const { data: fresh } = await db.from('vsl_players').select('hasta').eq('player_id', p.player_id).single();
    p.hasta = (fresh?.hasta as string | null) ?? null;
    if (p.hasta) {
      const after = await playsAfter(p, byDay);
      patch.plays_despues = after;
      patch.plays_despues_at = new Date().toISOString();
      if (after) log.push(`${p.nombre}: ${after} plays después de que salió de la landing`);
    }
    await db.from('vsl_players').update(patch).eq('player_id', p.player_id);
  }
  return log;
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // pg_cron (clave) o superadmin (JWT).
  const key = req.headers.get('x-sync-key');
  let allowed = false;
  if (key) {
    const { data } = await db.rpc('vsl_sync_auth', { p_key: key });
    allowed = data === true;
  } else {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
    const { data: caller } = await db.auth.getUser(jwt);
    if (caller?.user) {
      const { data: me } = await db.from('profiles').select('role, active, must_change_password').eq('id', caller.user.id).single();
      allowed = !!me && me.role === 'superadmin' && me.active && !me.must_change_password;
    }
  }
  if (!allowed) return json({ error: 'Sin permisos' }, 403);

  const body = await req.json().catch(() => ({}));
  const action = body.action ?? 'sync';

  if (!TOKEN) {
    if (action === 'sync') await db.from('vsl_sync_runs').insert({ ok: false, detalle: 'Falta el secreto VTURB_API_TOKEN en Supabase.' });
    return json({ ok: false, falta: ['VTURB_API_TOKEN'] }, 503);
  }

  calls = 0;
  try {
    if (action === 'stats') {
      const { player_id, desde, hasta } = body;
      if (typeof player_id !== 'string' || !Date.parse(desde) || !Date.parse(hasta)) return json({ error: 'Faltan player_id, desde o hasta' }, 400);
      const { data: p } = await db.from('vsl_players').select('player_id, nombre, desde, hasta, desde_fuente, duracion_seg, pitch_seg').eq('player_id', player_id).single();
      if (!p) return json({ error: 'Player desconocido' }, 404);
      const from = new Date(desde), to = new Date(hasta);
      const stats = await vt<VtStats>('POST', '/sessions/stats', statsBody(p as PlayerRow, arText(from), arText(to)));
      const byDay = await vt<VtStats[]>('POST', '/sessions/stats_by_day', statsBody(p as PlayerRow, `${arDay(from)} 00:00:00`, `${arDay(to)} 23:59:59`));
      const h = await honorsTime(p as PlayerRow, arDay(from), n((Array.isArray(byDay) ? byDay : []).find((r) => String(r.date_key).startsWith(arDay(from)))?.total_started));
      return json({ ok: true, desde: arText(from), hasta: arText(to), respeta_hora: h, stats, por_dia: byDay, llamadas: calls });
    }
    if (action !== 'sync') return json({ error: 'Acción desconocida' }, 400);

    const log = await runSync(db);
    await db.from('vsl_sync_runs').insert({ ok: true, detalle: log.join('\n'), llamadas: calls });
    return json({ ok: true, log, llamadas: calls });
  } catch (e) {
    const msg = redact((e as Error).message);
    console.error('vturb-sync:', msg);
    if (action === 'sync') await db.from('vsl_sync_runs').insert({ ok: false, detalle: msg, llamadas: calls });
    return json({ ok: false, error: msg }, e instanceof VturbError ? 502 : 500);
  }
});
