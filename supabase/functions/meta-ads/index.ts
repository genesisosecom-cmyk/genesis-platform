// Edge Function: métricas de Meta Ads para el panel de Métricas del campus (solo superadmin).
//
// Secrets: META_ACCESS_TOKEN y META_AD_ACCOUNT_ID (el número después de act=, con o sin «act_»).
// El token nunca sale de acá: no va en las respuestas, ni en los errores, ni en los logs
// (todo texto pasa por redact()). Las URLs de paginación de Meta llevan el token, así que
// nunca se devuelven.
//
// Acciones (POST, JSON):
//   { action: 'insights', launch, since, until, refresh? }  → pauta del rango + cruce con los leads
//   { action: 'creativos', refresh? }                       → miniaturas de los anuncios (vencen)
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

const GRAPH = 'https://graph.facebook.com/v24.0';
const CACHE_MINUTES = 5;
const AR_TZ = 'America/Argentina/Buenos_Aires';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const TOKEN = (Deno.env.get('META_ACCESS_TOKEN') ?? '').trim();
const ACCOUNT = (Deno.env.get('META_AD_ACCOUNT_ID') ?? '').trim().replace(/^act_/i, '').replace(/\D/g, '');

/** Saca el token de cualquier texto (errores de Meta, de red, logs). */
function redact(text: string) {
  let t = String(text ?? '');
  if (TOKEN) t = t.split(TOKEN).join('…');
  return t.replace(/access_token=[^&\s"']+/gi, 'access_token=…');
}

class MetaError extends Error {}

/** GET a la Graph API siguiendo paging.next. Devuelve todas las filas de `data`. */
async function graphAll(path: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const qs = new URLSearchParams({ ...params, access_token: TOKEN });
  let url: string | null = `${GRAPH}/${path}?${qs}`;
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; url && page < 50; page++) {
    let res: Response;
    try {
      res = await fetch(url);
    } catch (e) {
      throw new MetaError(redact(`No se pudo conectar con Meta: ${(e as Error).message}`));
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      const err = body.error ?? {};
      throw new MetaError(redact(`Meta respondió ${res.status}${err.code ? ` (código ${err.code})` : ''}: ${err.message ?? 'error desconocido'}`));
    }
    rows.push(...(body.data ?? []));
    url = body.paging?.next ?? null;
  }
  return rows;
}

// ---------- Caché ----------

async function cached<T>(db: SupabaseClient, kind: string, since: string, until: string, refresh: boolean, load: () => Promise<T>): Promise<{ data: T; cache: boolean; fetched_at: string }> {
  if (!refresh) {
    const { data } = await db.from('meta_ads_cache').select('payload, fetched_at').eq('account_id', ACCOUNT).eq('kind', kind).eq('since', since).eq('until', until).maybeSingle();
    if (data && Date.now() - Date.parse(data.fetched_at) < CACHE_MINUTES * 60_000) return { data: data.payload as T, cache: true, fetched_at: data.fetched_at };
  }
  const fresh = await load();
  const fetched_at = new Date().toISOString();
  const { error } = await db.from('meta_ads_cache').upsert({ account_id: ACCOUNT, kind, since, until, payload: fresh, fetched_at });
  if (error) console.error('meta-ads: no se pudo guardar el caché:', redact(error.message));
  return { data: fresh, cache: false, fetched_at };
}

// ---------- Lectura de Meta ----------

const num = (v: unknown) => (v === undefined || v === null || v === '' ? 0 : Number(v));
const lpvOf = (actions: unknown) =>
  num((Array.isArray(actions) ? actions : []).find((a: { action_type?: string }) => a.action_type === 'landing_page_view')?.value);

interface Stats { spend: number; impressions: number; reach: number; frequency: number | null; clicks: number; lpv: number }
const stats = (r: Record<string, unknown>): Stats => ({
  spend: num(r.spend),
  impressions: num(r.impressions),
  reach: num(r.reach),
  frequency: r.frequency === undefined ? null : num(r.frequency),
  clicks: num(r.inline_link_clicks),
  lpv: lpvOf(r.actions),
});

export function entrega(s: unknown): 'Activo' | 'En revisión' | 'Rechazado' | 'Con problemas' | 'Apagado' {
  switch (String(s ?? '')) {
    case 'ACTIVE': return 'Activo';
    case 'IN_PROCESS': case 'PENDING_REVIEW': case 'PREAPPROVED': return 'En revisión';
    case 'DISAPPROVED': return 'Rechazado';
    case 'WITH_ISSUES': return 'Con problemas';
    default: return 'Apagado';
  }
}

const STATS_FIELDS = 'spend,impressions,inline_link_clicks,actions,reach,frequency';

async function loadMeta(since: string, until: string) {
  const act = `act_${ACCOUNT}`;
  const tr = JSON.stringify({ since, until });
  const [total, porDia, porAnuncio, anuncioDia, porConjunto, porCampana, ads, adsets, campaigns] = await Promise.all([
    graphAll(`${act}/insights`, { level: 'account', fields: STATS_FIELDS, time_range: tr }),
    graphAll(`${act}/insights`, { level: 'account', fields: STATS_FIELDS, time_range: tr, time_increment: '1', limit: '500' }),
    graphAll(`${act}/insights`, { level: 'ad', fields: `${STATS_FIELDS},campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name`, time_range: tr, limit: '500' }),
    graphAll(`${act}/insights`, { level: 'ad', fields: `ad_id,${STATS_FIELDS}`, time_range: tr, time_increment: '1', limit: '500' }),
    // Alcance y frecuencia no se suman entre anuncios: se piden por conjunto y por campaña.
    graphAll(`${act}/insights`, { level: 'adset', fields: `adset_id,${STATS_FIELDS}`, time_range: tr, limit: '500' }),
    graphAll(`${act}/insights`, { level: 'campaign', fields: `campaign_id,${STATS_FIELDS}`, time_range: tr, limit: '500' }),
    graphAll(`${act}/ads`, { fields: 'id,name,effective_status,adset_id,campaign_id', limit: '500' }),
    graphAll(`${act}/adsets`, { fields: 'id,name,effective_status,daily_budget,campaign_id', limit: '500' }),
    graphAll(`${act}/campaigns`, { fields: 'id,name,effective_status,daily_budget', limit: '500' }),
  ]);
  return { total, porDia, porAnuncio, anuncioDia, porConjunto, porCampana, ads, adsets, campaigns };
}
type MetaRaw = Awaited<ReturnType<typeof loadMeta>>;

// ---------- Leads de pauta y cruce con anuncios ----------

interface LeadRow {
  id: string;
  full_name: string;
  optin_at: string;
  inversion_meta: string | null;
  stage: string;
  califica: boolean | null;
  toco_grupo: boolean;
  agendo: boolean | null;
  tracking: Record<string, string> | null;
  sales_calls: { result: string | null }[];
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, '');
const arDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ }).format(new Date(iso));

async function pautaLeads(db: SupabaseClient, launch: string, since: string, until: string) {
  // Un día de margen a cada lado (UTC vs. Argentina) y después se filtra por día de Argentina.
  const from = new Date(`${since}T00:00:00-03:00`).toISOString();
  const to = new Date(`${until}T23:59:59.999-03:00`).toISOString();
  const rows: LeadRow[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from('lead_launches')
      .select('id, optin_at, inversion_meta, stage, califica, toco_grupo, agendo, tracking, lead:leads(full_name), sales_calls(result)')
      .eq('launch_id', launch)
      .eq('source', 'Anuncios de Meta')
      .is('no_cuenta_reason', null)
      .gte('optin_at', from)
      .lte('optin_at', to)
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(`No se pudieron leer los leads: ${error.message}`);
    rows.push(...(data ?? []).map((r: Record<string, unknown>) => ({ ...r, full_name: (r.lead as { full_name?: string } | null)?.full_name ?? '' }) as unknown as LeadRow));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

interface AdInfo { id: string; name: string; adset_id: string; adset_name: string; campaign_id: string; campaign_name: string }

function buildMatcher(meta: MetaRaw) {
  const adsets = new Map(meta.adsets.map((a) => [String(a.id), a]));
  const campaigns = new Map(meta.campaigns.map((c) => [String(c.id), c]));
  const ads = new Map<string, AdInfo>();
  for (const a of meta.ads) {
    ads.set(String(a.id), {
      id: String(a.id), name: String(a.name ?? ''),
      adset_id: String(a.adset_id ?? ''), adset_name: String(adsets.get(String(a.adset_id))?.name ?? ''),
      campaign_id: String(a.campaign_id ?? ''), campaign_name: String(campaigns.get(String(a.campaign_id))?.name ?? ''),
    });
  }
  for (const r of meta.porAnuncio) {
    const id = String(r.ad_id);
    if (!ads.has(id)) ads.set(id, { id, name: String(r.ad_name ?? ''), adset_id: String(r.adset_id ?? ''), adset_name: String(r.adset_name ?? ''), campaign_id: String(r.campaign_id ?? ''), campaign_name: String(r.campaign_name ?? '') });
  }
  const byName = new Map<string, AdInfo[]>();
  for (const a of ads.values()) byName.set(norm(a.name), [...(byName.get(norm(a.name)) ?? []), a]);

  return (t: Record<string, string> | null): { ad: AdInfo | null; why?: 'sin_datos' | 'no_encontrado' | 'ambiguo' } => {
    const adId = String(t?.ad_id ?? '').trim();
    if (adId && ads.has(adId)) return { ad: ads.get(adId)! };
    const content = norm(t?.utm_content);
    if (!content) return { ad: null, why: adId ? 'no_encontrado' : 'sin_datos' };
    let cands = byName.get(content) ?? [];
    if (!cands.length) return { ad: null, why: 'no_encontrado' };
    const term = norm(t?.utm_term);
    if (cands.length > 1 && term) {
      const f = cands.filter((a) => norm(a.adset_name) === term || norm(a.adset_id) === term);
      if (f.length) cands = f;
    }
    const camp = norm(t?.utm_campaign);
    if (cands.length > 1 && camp) {
      const f = cands.filter((a) => norm(a.campaign_name) === camp || norm(a.campaign_id) === camp);
      if (f.length) cands = f;
    }
    return cands.length === 1 ? { ad: cands[0] } : { ad: null, why: 'ambiguo' };
  };
}

// ---------- Armado de la respuesta ----------

interface Outcomes { optins: number; calificados: number; grupo: number; agendas: number; ventas: number }
const emptyOutcomes = (): Outcomes => ({ optins: 0, calificados: 0, grupo: 0, agendas: 0, ventas: 0 });

function buildInsights(meta: MetaRaw, leads: LeadRow[]) {
  const match = buildMatcher(meta);
  const adStats = new Map(meta.porAnuncio.map((r) => [String(r.ad_id), stats(r)]));
  const adsetStats = new Map(meta.porConjunto.map((r) => [String(r.adset_id), stats(r)]));
  const campStats = new Map(meta.porCampana.map((r) => [String(r.campaign_id), stats(r)]));

  const out = { ad: new Map<string, Outcomes>(), adset: new Map<string, Outcomes>(), campaign: new Map<string, Outcomes>() };
  const leadsByAd = new Map<string, string[]>();
  const adDay = new Map<string, Map<string, { optins: number; calificados: number }>>();
  const sinCruzar = { ...emptyOutcomes(), motivos: { sin_datos: 0, no_encontrado: 0, ambiguo: 0 }, lead_ids: [] as string[] };
  const leadInfo: Record<string, unknown> = {};

  for (const l of leads) {
    const o: Outcomes = {
      optins: 1,
      calificados: l.califica ? 1 : 0,
      grupo: l.toco_grupo ? 1 : 0,
      agendas: l.agendo || l.sales_calls.length ? 1 : 0,
      ventas: l.sales_calls.some((c) => c.result === 'cerro') ? 1 : 0,
    };
    leadInfo[l.id] = { nombre: l.full_name, fecha: l.optin_at, inversion: l.inversion_meta, stage: l.stage, califica: Boolean(l.califica), compro: o.ventas === 1 };
    const m = match(l.tracking);
    if (!m.ad) {
      (Object.keys(o) as (keyof Outcomes)[]).forEach((k) => (sinCruzar[k] += o[k]));
      sinCruzar.motivos[m.why!] += 1;
      sinCruzar.lead_ids.push(l.id);
      continue;
    }
    const add = (map: Map<string, Outcomes>, key: string) => {
      const cur = map.get(key) ?? emptyOutcomes();
      (Object.keys(o) as (keyof Outcomes)[]).forEach((k) => (cur[k] += o[k]));
      map.set(key, cur);
    };
    add(out.ad, m.ad.id);
    add(out.adset, m.ad.adset_id);
    add(out.campaign, m.ad.campaign_id);
    leadsByAd.set(m.ad.id, [...(leadsByAd.get(m.ad.id) ?? []), l.id]);
    const day = arDay(l.optin_at);
    const days = adDay.get(m.ad.id) ?? new Map();
    const cur = days.get(day) ?? { optins: 0, calificados: 0 };
    cur.optins += 1;
    cur.calificados += o.calificados;
    days.set(day, cur);
    adDay.set(m.ad.id, days);
  }

  const zero: Stats = { spend: 0, impressions: 0, reach: 0, frequency: null, clicks: 0, lpv: 0 };
  const adSeries = new Map<string, Record<string, unknown>[]>();
  for (const r of meta.anuncioDia) {
    const id = String(r.ad_id);
    const day = String(r.date_start);
    const lo = adDay.get(id)?.get(day);
    adSeries.set(id, [...(adSeries.get(id) ?? []), { dia: day, ...stats(r), optins: lo?.optins ?? 0, calificados: lo?.calificados ?? 0 }]);
  }

  const campaigns = meta.campaigns.map((c) => ({
    id: String(c.id), nombre: String(c.name ?? ''), entrega: entrega(c.effective_status), estado: String(c.effective_status ?? ''),
    presupuesto_diario: c.daily_budget ? num(c.daily_budget) / 100 : null,
    ...(campStats.get(String(c.id)) ?? zero), ...(out.campaign.get(String(c.id)) ?? emptyOutcomes()),
  }));
  const adsets = meta.adsets.map((a) => ({
    id: String(a.id), nombre: String(a.name ?? ''), campaign_id: String(a.campaign_id ?? ''), entrega: entrega(a.effective_status), estado: String(a.effective_status ?? ''),
    presupuesto_diario: a.daily_budget ? num(a.daily_budget) / 100 : null,
    ...(adsetStats.get(String(a.id)) ?? zero), ...(out.adset.get(String(a.id)) ?? emptyOutcomes()),
  }));
  const ads = meta.ads.map((a) => ({
    id: String(a.id), nombre: String(a.name ?? ''), adset_id: String(a.adset_id ?? ''), campaign_id: String(a.campaign_id ?? ''),
    entrega: entrega(a.effective_status), estado: String(a.effective_status ?? ''), presupuesto_diario: null,
    ...(adStats.get(String(a.id)) ?? zero), ...(out.ad.get(String(a.id)) ?? emptyOutcomes()),
    lead_ids: leadsByAd.get(String(a.id)) ?? [],
    serie: (adSeries.get(String(a.id)) ?? []).sort((x, y) => String(x.dia).localeCompare(String(y.dia))),
  }));

  // Los estados se cuentan solo en campañas activas: las pausadas arrastran anuncios viejos rechazados o con problemas.
  const liveCampaigns = new Set(campaigns.filter((c) => c.entrega === 'Activo').map((c) => c.id));
  const live = ads.filter((a) => liveCampaigns.has(a.campaign_id));
  const count = (rows: { entrega: string }[], e: string) => rows.filter((r) => r.entrega === e).length;
  const totalOutcomes = leads.length;
  return {
    total: {
      ...(meta.total[0] ? stats(meta.total[0]) : zero),
      optins: totalOutcomes,
      calificados: leads.filter((l) => l.califica).length,
      grupo: leads.filter((l) => l.toco_grupo).length,
    },
    por_dia: meta.porDia.map((r) => ({ dia: String(r.date_start), ...stats(r) })).sort((a, b) => a.dia.localeCompare(b.dia)),
    estados: { activos: count(live, 'Activo'), en_revision: count(live, 'En revisión'), rechazados: count(live, 'Rechazado'), con_problemas: count(live, 'Con problemas') },
    campanas: campaigns,
    conjuntos: adsets,
    anuncios: ads,
    sin_cruzar: sinCruzar,
    leads: leadInfo,
  };
}

async function loadCreatives() {
  const rows = await graphAll(`act_${ACCOUNT}/ads`, {
    fields: 'id,name,campaign{name},adset{name},creative.thumbnail_width(640).thumbnail_height(640){id,thumbnail_url,image_url,video_id,object_type}',
    limit: '25',
  });
  return rows.map((r) => {
    const c = (r.creative ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id), nombre: String(r.name ?? ''),
      campana: String((r.campaign as { name?: string } | undefined)?.name ?? ''), conjunto: String((r.adset as { name?: string } | undefined)?.name ?? ''),
      miniatura: (c.thumbnail_url as string) ?? null, imagen: (c.image_url as string) ?? null,
      video_id: (c.video_id as string) ?? null, tipo: (c.object_type as string) ?? null,
    };
  });
}

// ---------- Handler ----------

const isDay = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // Solo superadmin: JWT válido + perfil superadmin activo.
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: caller } = await db.auth.getUser(jwt);
  if (!caller.user) return json({ error: 'No autenticado' }, 401);
  const { data: me } = await db.from('profiles').select('role, active, must_change_password').eq('id', caller.user.id).single();
  if (!me || me.role !== 'superadmin' || !me.active || me.must_change_password) return json({ error: 'Sin permisos' }, 403);

  const falta = [!TOKEN && 'META_ACCESS_TOKEN', !ACCOUNT && 'META_AD_ACCOUNT_ID'].filter(Boolean);
  if (falta.length) return json({ ok: false, falta });

  const body = await req.json().catch(() => ({}));
  const refresh = body.refresh === true;
  try {
    if (body.action === 'creativos') {
      const r = await cached(db, 'creativos', '2000-01-01', '2000-01-01', refresh, loadCreatives);
      return json({ ok: true, cuenta: ACCOUNT, cache: r.cache, actualizado: r.fetched_at, creativos: r.data });
    }
    if (body.action === 'insights') {
      if (!isDay(body.since) || !isDay(body.until) || typeof body.launch !== 'string') return json({ error: 'Faltan launch, since o until (YYYY-MM-DD)' }, 400);
      const [r, leads] = await Promise.all([
        cached(db, 'insights', body.since, body.until, refresh, () => loadMeta(body.since, body.until)),
        pautaLeads(db, body.launch, body.since, body.until),
      ]);
      const inRange = leads.filter((l) => { const d = arDay(l.optin_at); return d >= body.since && d <= body.until; });
      return json({ ok: true, cuenta: ACCOUNT, desde: body.since, hasta: body.until, cache: r.cache, actualizado: r.fetched_at, ...buildInsights(r.data, inRange) });
    }
    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    const msg = redact((e as Error).message);
    console.error('meta-ads:', msg);
    return json({ ok: false, error: msg }, e instanceof MetaError ? 502 : 500);
  }
});
