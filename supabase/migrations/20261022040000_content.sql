-- =====================================================================
-- Contenido del campus administrable desde el panel:
-- módulos, lecciones y herramientas del baúl (+ archivos en Storage).
-- =====================================================================

-- Los ids son texto para seguir siendo compatibles con lesson_progress
-- (module_id / lesson_id). Los nuevos se generan como uuid.
create table public.modules (
  id text primary key default gen_random_uuid()::text,
  position int not null default 0,
  title text not null,
  subtitle text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.lessons (
  id text primary key default gen_random_uuid()::text,
  module_id text not null references public.modules (id) on delete cascade,
  position int not null default 0,
  title text not null,
  description text,
  video_url text,
  duration_min int not null default 0 check (duration_min >= 0),
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create index lessons_module_idx on public.lessons (module_id, position);

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  position int not null default 0,
  name text not null,
  description text,
  category text not null default 'General',
  type text not null default 'Recurso',
  url text,                -- link externo (Drive, Notion, software…)
  file_path text,          -- o archivo subido al bucket privado "toolbox"
  file_name text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.tools enable row level security;

-- Miembros logueados ven lo publicado; los admins ven y editan todo.
create policy "modules: miembros ven publicados" on public.modules
  for select to authenticated using (published or (select private.is_superadmin()));
create policy "modules: admin inserta" on public.modules
  for insert to authenticated with check ((select private.is_superadmin()));
create policy "modules: admin actualiza" on public.modules
  for update to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "modules: admin borra" on public.modules
  for delete to authenticated using ((select private.is_superadmin()));

create policy "lessons: miembros ven publicadas" on public.lessons
  for select to authenticated using (published or (select private.is_superadmin()));
create policy "lessons: admin inserta" on public.lessons
  for insert to authenticated with check ((select private.is_superadmin()));
create policy "lessons: admin actualiza" on public.lessons
  for update to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "lessons: admin borra" on public.lessons
  for delete to authenticated using ((select private.is_superadmin()));

create policy "tools: miembros ven publicadas" on public.tools
  for select to authenticated using (published or (select private.is_superadmin()));
create policy "tools: admin inserta" on public.tools
  for insert to authenticated with check ((select private.is_superadmin()));
create policy "tools: admin actualiza" on public.tools
  for update to authenticated using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "tools: admin borra" on public.tools
  for delete to authenticated using ((select private.is_superadmin()));

-- Bucket privado para archivos del baúl (límite 50 MB por archivo, el máximo del plan free).
insert into storage.buckets (id, name, public, file_size_limit)
values ('toolbox', 'toolbox', false, 52428800)
on conflict (id) do nothing;

create policy "toolbox: miembros descargan" on storage.objects
  for select to authenticated using (bucket_id = 'toolbox');
create policy "toolbox: admin sube" on storage.objects
  for insert to authenticated with check (bucket_id = 'toolbox' and (select private.is_superadmin()));
create policy "toolbox: admin actualiza" on storage.objects
  for update to authenticated using (bucket_id = 'toolbox' and (select private.is_superadmin()));
create policy "toolbox: admin borra" on storage.objects
  for delete to authenticated using (bucket_id = 'toolbox' and (select private.is_superadmin()));

-- ---------- Contenido inicial (el que estaba fijo en el código) ----------
insert into public.modules (id, position, title, subtitle) values
  ('fundamentos', 1, 'Fundamentos', 'La mentalidad y el sistema detrás de Genesis.'),
  ('oferta', 2, 'Oferta y posicionamiento', 'Construí una oferta que se venda sola.'),
  ('adquisicion', 3, 'Adquisición', 'Sistemas predecibles para generar clientes.'),
  ('ventas', 4, 'Ventas', 'Cerrar con confianza y sin presión.'),
  ('escala', 5, 'Operación y escala', 'Delegá, automatizá y crecé.');

insert into public.lessons (id, module_id, position, title, description, duration_min) values
  ('bienvenida', 'fundamentos', 1, 'Bienvenida al programa', 'Cómo aprovechar la plataforma y qué vas a lograr al terminar.', 8),
  ('mentalidad', 'fundamentos', 2, 'Mentalidad de operador', null, 22),
  ('mapa', 'fundamentos', 3, 'El mapa completo del sistema', null, 18),
  ('objetivos', 'fundamentos', 4, 'Definir objetivos medibles', null, 15),
  ('nicho', 'oferta', 1, 'Elegir y validar tu nicho', null, 24),
  ('avatar', 'oferta', 2, 'Cliente ideal y dolores reales', null, 19),
  ('oferta-irresistible', 'oferta', 3, 'Diseñar una oferta irresistible', null, 31),
  ('pricing', 'oferta', 4, 'Pricing y paquetes', null, 17),
  ('contenido', 'adquisicion', 1, 'Contenido que atrae', null, 26),
  ('outreach', 'adquisicion', 2, 'Prospección en frío', null, 28),
  ('ads', 'adquisicion', 3, 'Introducción a anuncios pagos', null, 34),
  ('llamada', 'ventas', 1, 'Estructura de la llamada de venta', null, 29),
  ('objeciones', 'ventas', 2, 'Manejo de objeciones', null, 23),
  ('seguimiento', 'ventas', 3, 'Seguimiento que cierra', null, 14),
  ('procesos', 'escala', 1, 'Procesos y SOPs', null, 21),
  ('equipo', 'escala', 2, 'Contratar a tu primer equipo', null, 25),
  ('automatizacion', 'escala', 3, 'Automatizaciones clave', null, 27),
  ('metricas', 'escala', 4, 'Métricas para escalar', null, 20);

-- Herramientas de ejemplo como borrador: no tienen archivo ni link todavía.
insert into public.tools (position, name, description, category, type, url, published) values
  (1, 'Plantilla de oferta', 'Documento guía para estructurar tu oferta paso a paso.', 'Oferta', 'Plantilla', null, false),
  (2, 'Calculadora de pricing', 'Hoja de cálculo para definir precios y márgenes.', 'Oferta', 'Plantilla', null, false),
  (3, 'Guion de llamada de venta', 'El guion completo usado en el módulo de Ventas.', 'Ventas', 'Recurso', null, false),
  (4, 'Banco de objeciones', 'Respuestas listas para las 25 objeciones más comunes.', 'Ventas', 'Recurso', null, false),
  (5, 'Secuencias de prospección', 'Mensajes probados para email, LinkedIn e Instagram.', 'Adquisición', 'Plantilla', null, false),
  (6, 'Prompts de contenido', 'Prompts de IA para generar ideas y guiones en minutos.', 'Adquisición', 'Prompt', null, false),
  (7, 'CRM recomendado', 'Configuración sugerida para gestionar tu pipeline.', 'Operación', 'Software', null, false),
  (8, 'Kit de SOPs', 'Plantillas de procesos para delegar desde el día uno.', 'Operación', 'Plantilla', null, false),
  (9, 'Dashboard de métricas', 'Tablero para seguir los KPIs del negocio semana a semana.', 'Operación', 'Plantilla', null, false);
