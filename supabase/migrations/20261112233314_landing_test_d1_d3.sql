-- =====================================================================
-- Test nuevo de la landing del webinar 17/11: d1 contra d3.
-- Desde el 12/11 a las 19:59 (hora de Argentina) el link /clase reparte 50/50 solo entre d1 y d3
-- (los 4 anuncios de adquisición apuntan a /clase). Mismo titular y bajada; cambia el video.
-- El test del 12/11 (a2 contra a3) se cierra a esa hora. No se borra nada: los tests viejos
-- siguen en la base y en Configuración CRM, solo dejan de mostrarse en Métricas.
-- =====================================================================

update public.landing_tests set ends_at = '2026-11-12 19:59-03'
where id = 'titular-orden-12-11' and ends_at is null;

insert into public.landing_tests (id, nombre, descripcion, tipo, starts_at, ends_at, stable_from) values
  ('sistemas-12-11', 'Te regalo mis sistemas · d1 contra d3',
   'Mismo titular y bajada; d1 tiene VSL y d3 no tiene video. El link /clase reparte 50/50 entre las dos y cada una tiene su link fijo (/d1, /d3).',
   'test', '2026-11-12 19:59-03', null, null);

insert into public.landing_test_variants (test_id, code, nombre, titular_key, titular, bajada, orden_key, orden, sort) values
  ('sistemas-12-11', 'd1', 'd1 · con VSL', 'd',
   'Te regalo mis sistemas con los que facturo $275M/Mes solo de recompras y sin depender de Meta',
   '¿Tu ecommerce de consumibles depende de conseguir clientes nuevos todos los meses para facturar? Te muestro mi plan paso a paso para facturar +$100M/mes solo de recompras, en vivo y gratis.',
   'vsl', 'Titular + bajada + VSL + formulario', 1),
  ('sistemas-12-11', 'd3', 'd3 · sin video', 'd',
   'Te regalo mis sistemas con los que facturo $275M/Mes solo de recompras y sin depender de Meta',
   '¿Tu ecommerce de consumibles depende de conseguir clientes nuevos todos los meses para facturar? Te muestro mi plan paso a paso para facturar +$100M/mes solo de recompras, en vivo y gratis.',
   'sin-video', 'Titular + bajada + formulario (sin video)', 2);
