-- =====================================================================
-- Formulario Pre-clase paso a paso + agenda de clases por programa
-- =====================================================================

-- Tipo de formulario: 'pre_clase' usa la agenda (programa → clase → preguntas);
-- 'custom' muestra las preguntas configuradas una por pantalla.
alter table public.forms
  add column kind text not null default 'custom' check (kind in ('custom', 'pre_clase')),
  add column settings jsonb not null default '{}'::jsonb;

-- Datos de la clase a la que se refiere cada respuesta (para filtrar por coach/fecha).
alter table public.form_responses
  add column program text,
  add column coach text,
  add column call_kind text check (call_kind in ('grupal', '1:1')),
  add column slot_label text;
create index form_responses_call_date_idx on public.form_responses (call_date);

-- Agenda: clases grupales semanales y 1:1 a pedido, con los programas que acceden.
create table public.class_slots (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'grupal' check (kind in ('grupal', '1:1')),
  weekday int check (weekday between 1 and 7), -- 1 = lunes … 7 = domingo; null para 1:1
  start_time text,                              -- 'HH:MM'
  coach text not null,
  programs text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (kind = '1:1' or (weekday is not null and start_time is not null))
);

alter table public.class_slots enable row level security;
create policy "slots: lectura pública de activos" on public.class_slots
  for select to anon, authenticated
  using (active or (select private.is_superadmin()));
create policy "slots: admin inserta" on public.class_slots
  for insert to authenticated with check ((select private.is_superadmin()));
create policy "slots: admin actualiza" on public.class_slots
  for update to authenticated
  using ((select private.is_superadmin())) with check ((select private.is_superadmin()));
create policy "slots: admin borra" on public.class_slots
  for delete to authenticated using ((select private.is_superadmin()));

insert into public.class_slots (kind, weekday, start_time, coach, programs) values
  ('grupal', 1, '19:00', 'José', '{Genesis OG,Fast Subscription,Genesis OS}'),
  ('grupal', 2, '19:00', 'Manu', '{Genesis OG,Fast Subscription,Genesis OS}'),
  ('grupal', 3, '19:00', 'José', '{Genesis OG,Fast Subscription,Genesis OS}'),
  ('grupal', 4, '19:00', 'Manu', '{Genesis OG,Genesis OS}'),
  ('1:1', null, null, 'Manu', '{Genesis OS}'),
  ('1:1', null, null, 'José', '{Genesis OS}');

insert into public.forms (slug, title, description, call_type, kind, settings, questions) values (
  'pre-clase',
  'Pre-Clase',
  'Completalo antes de la clase así el coach llega con tu caso pensado y aprovechamos el tiempo al máximo.',
  'grupal',
  'pre_clase',
  '{
    "bullets_title": "Antes de preguntar:",
    "bullets": ["Revisá si la clase del campus de ese tema ya lo responde.", "Pensá cómo lo resolverías vos."],
    "callout": "Traé tu solución para validarla, no el problema para que te lo resuelvan.",
    "callout_highlight": "Preguntar bien = avanzar rápido.",
    "question_help": "Estructura: en qué estás + qué ya probaste + qué necesitás resolver.",
    "question_example": "Ej: Estoy en la ventana de adquisición del lanzamiento del 18/10. Llevo 140 opt-ins a $3,20 y desde el domingo cambié a ads más segmentados y bajó a menos de 20. Ya probé volver a prender los ads viejos pero no levantan. ¿Vuelvo a la segmentación amplia y filtro la calidad en el formulario, o banco los ads nuevos unos días más?"
  }'::jsonb,
  '[]'::jsonb
);
