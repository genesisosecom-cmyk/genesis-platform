-- =====================================================================
-- Paso 8 · Registro de contenido.
-- Cada pieza con su subavatar, dolor, palabra y métricas a 48 h, 7 y 30
-- días. Las conversaciones, aplicaciones y la caja por pieza no se cargan
-- a mano: salen de lead_launches.entry_content_id (paso 10).
-- =====================================================================

create table public.content_weeks (
  id uuid primary key default gen_random_uuid(),
  funnel_id text not null references public.funnels (id) on update cascade,
  week_start date not null,                 -- lunes
  pain integer check (pain between 1 and 10),
  subavatar text,
  thread text not null default '',          -- el hilo: el dolor de la semana en una frase
  ask text not null default '',             -- el pedido de la semana y su palabra
  ritual_notes text not null default '',    -- lo que salió del ritual del sábado
  unique (funnel_id, week_start)
);

create table public.content_pieces (
  id uuid primary key default gen_random_uuid(),
  funnel_id text not null references public.funnels (id) on update cascade,
  launch_id text references public.launches (id) on update cascade,
  week_id uuid references public.content_weeks (id) on delete set null,
  publish_at timestamptz,
  format text not null check (format in ('youtube', 'flywheel', 'reel', 'trial_reel', 'historias', 'tiktok', 'short', 'mail', 'whatsapp', 'post', 'otro')),
  job text check (job in ('atraccion', 'nutricion', 'conversion', 'conexion')),
  title text not null,                      -- hook o título textual
  subavatar text check (subavatar in ('S1', 'S2', 'S3', 'raiz', 'seguidor')),
  pain integer check (pain between 1 and 10),
  angle text,                               -- A–I
  keyword text,                             -- palabra de ManyChat
  cta text,
  source_video text,                        -- de qué video largo sale el corte
  variant_of uuid references public.content_pieces (id) on delete set null,  -- trial reel: la pieza base
  variable text,                            -- qué variable cambia el trial
  status text not null default 'idea' check (status in ('idea', 'guion', 'grabado', 'editado', 'programado', 'publicado', 'descartado')),
  url text,
  responsible_name text not null default '',
  task_id text references public.tasks (id) on delete set null on update cascade,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_pieces_funnel_idx on public.content_pieces (funnel_id, publish_at);
create index content_pieces_week_idx on public.content_pieces (week_id);
create index content_pieces_keyword_idx on public.content_pieces (funnel_id, keyword) where keyword is not null;

create table public.content_metrics (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.content_pieces (id) on delete cascade,
  cut text not null check (cut in ('48h', '7d', '30d')),
  measured_at timestamptz not null default now(),
  views integer, reach integer, shares integer, saves integer, comments integer, likes integer,
  qualified_comments integer,               -- comentarios de S1/S2/S3
  new_followers integer, qualified_followers integer,
  story_drop_pct numeric,                   -- caída entre historias (historias)
  story_replies integer,                    -- respuestas (historias)
  avg_view_pct numeric,                     -- retención (YouTube)
  keyword_conversations integer,            -- conversaciones que abrió su palabra
  unique (piece_id, cut)
);

alter table public.lead_launches
  add constraint lead_launches_entry_content_fk
  foreign key (entry_content_id) references public.content_pieces (id) on delete set null;

-- ---------- RLS: escribe el admin; el equipo de ventas lee (para marcar qué pieza trajo a cada lead) ----------
alter table public.content_weeks enable row level security;
alter table public.content_pieces enable row level security;
alter table public.content_metrics enable row level security;

create policy "content_weeks: solo admin" on public.content_weeks
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "content_weeks: el equipo lee" on public.content_weeks
  for select to authenticated using ((select private.my_sdr_id()) is not null or (select private.my_closer_id()) is not null);
create policy "content_pieces: solo admin" on public.content_pieces
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "content_pieces: el equipo lee" on public.content_pieces
  for select to authenticated using ((select private.my_sdr_id()) is not null or (select private.my_closer_id()) is not null);
create policy "content_metrics: solo admin" on public.content_metrics
  for all to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "content_metrics: el equipo lee" on public.content_metrics
  for select to authenticated using ((select private.my_sdr_id()) is not null or (select private.my_closer_id()) is not null);

create function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function private.touch_updated_at() from public, anon, authenticated;
create trigger content_pieces_touch before update on public.content_pieces
  for each row execute function private.touch_updated_at();

-- ---------- Qué pieza trajo al lead: por link (o título) o por palabra + fecha ----------
-- Con link: la pieza de ese link. Si no, la última pieza publicada (o programada) con esa palabra
-- hasta el momento en que escribió. El setter la puede corregir en la ficha.
create or replace function private.content_for_keyword(p_launch text, p_keyword text, p_at timestamptz, p_url text)
returns uuid language sql stable set search_path = '' as $$
  select cp.id
  from public.content_pieces cp
  where cp.funnel_id = (select funnel_id from public.launches where id = p_launch)
    and cp.status <> 'descartado'
    and ((nullif(trim(p_url), '') is not null and (cp.url = trim(p_url) or lower(cp.title) = lower(trim(p_url))))
      or (p_keyword is not null and upper(cp.keyword) = upper(p_keyword) and cp.publish_at <= p_at))
  order by (nullif(trim(p_url), '') is not null and (cp.url = trim(p_url) or lower(cp.title) = lower(trim(p_url)))) desc, cp.publish_at desc nulls last
  limit 1;
$$;
