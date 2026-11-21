-- =====================================================================
-- Paso 4 · Tareas del funnel Evergreen orgánico: 8 fases y 121 tareas.
-- Generado desde mi-negocio/bases/campus-tareas-evergreen.json (20/11/2026).
-- No pisa nada: si una fase o un id ya existe, se saltea.
-- «Quién:» = el plan nombraba a varios o a un rol (setter, closer, editor).
-- «Cuándo:» = el plan no traía una fecha exacta.
-- =====================================================================

insert into public.task_phases (name, prefix, sort, funnel_id, offset_days) values
  ('Evergreen · Semana puente 21-28/11', 'PTE', 20, 'evergreen-organico', null),
  ('Evergreen · Decisiones', 'DEC', 21, 'evergreen-organico', null),
  ('Evergreen · Semana 0 · Alinear', 'EV0', 22, 'evergreen-organico', null),
  ('Evergreen · Correcciones de materiales', 'COR', 23, 'evergreen-organico', null),
  ('Evergreen · Semanas 1-2 · Montar', 'EV1', 24, 'evergreen-organico', null),
  ('Evergreen · Semanas 3-8 · Operar', 'EV2', 25, 'evergreen-organico', null),
  ('Evergreen · Escalar', 'ESC', 26, 'evergreen-organico', null),
  ('Evergreen · Datos pendientes', 'PEN', 27, 'evergreen-organico', null)
on conflict do nothing;

with nuevas as (
  insert into public.tasks (id, title, phase, funnel_id, launch_id, quantity, status, responsible_id, responsible_name, due_date,
                            agent, reference, link, notes, created_by_name, updated_by_name)
  select v.id, v.title, v.phase, 'evergreen-organico', (select id from public.launches where id = 'evergreen-2026-q4'),
         v.quantity, v.status, private.task_person(nullif(v.responsible_name, '')), v.responsible_name, v.due_date::date,
         v.agent, v.reference, v.link, v.notes, 'Plan evergreen', 'Plan evergreen'
  from (values
    ('EV0-01', 'Mensaje «cerró», apagar ads post-clase y automatizaciones del post-clase (quedan 6, sábado 21)', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Mati', '2026-11-20', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Hecho cuando: Ads en pausa con gasto final en el campus; ningún flujo del 17/11 envía después del cierre · SOP 03 · id del plan: S0.1'),
    ('EV0-02', 'Reporte por fases de cada llamada del 17/11', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Manu', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Closer, Manu, José
Hecho cuando: 1 reporte por lead con subavatar, pieza que lo trajo, carril y objeciones textuales · SOP 04 · id del plan: S0.2'),
    ('EV0-03', 'Clasificar aplicaciones del 17/11 por subavatar y carril; semáforo bloque 17/11-1', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi, Mati
Hecho cuando: Tabla de aplicaciones, llamadas con precio, ventas OS y Lite, PIF/pagos por S1/S2/S3 · SOP 08 · id del plan: S0.3'),
    ('EV0-04', 'Historia «cerró, no se reabre»', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Manu', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Hecho cuando: 1–2 historias sin pedido ni link · SOP 09 · id del plan: S0.4'),
    ('EV0-05', 'Pre-weekly + checkpoint de la base 11 y del plan: decisiones D1–D13', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi conduce; Manu y José deciden
Hecho cuando: Acta escrita con cada decisión · SOP 04 · id del plan: S0.5'),
    ('EV0-06', 'Test SOP 01: Manu lee hooks y líneas de la semana 1 pensando en S1, S2 y S3', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Manu', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Hecho cuando: Hooks aprobados o reescritos; frases [CONFIRMAR MANU] resueltas · SOP 05 · id del plan: S0.6'),
    ('EV0-07', 'Perfil base: nombre, bio nueva, link a WhatsApp, archivar destacadas del lanzamiento, Empezá acá', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Santi', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi, Mati, Manu aprueba
Hecho cuando: Capturas del perfil; test de 5 segundos con 2 personas que encajen en S1 [HIP] · SOP 02 · id del plan: S0.7'),
    ('EV0-08', 'ManyChat: CUENTA, PISO, CICLO, TRATAMIENTO con texto, link y WhatsApp', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Hecho cuando: Cada palabra probada desde una cuenta ajena devuelve el mensaje · SOP 03 · id del plan: S0.8'),
    ('EV0-09', 'Guion del setter evergreen + registro del setter', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Santi', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Mati; setter prueba; Santi revisa
Hecho cuando: Aperturas por subavatar, 4 preguntas, salidas, 1 seguimiento; planilla con palabra, video, subavatar, frase, carril · SOP 04 · id del plan: S0.9'),
    ('EV0-10', 'Formulario de aplicación con las 4 preguntas nuevas de la base 11', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Hecho cuando: Formulario publicado y probado con un envío · SOP 04 · id del plan: S0.10'),
    ('EV0-11', 'Correcciones prioridad 1: VSL de chat, oferta-genesis.html, manual y guion de llamada, genesis-contexto.md', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Mati; Manu regraba VSL de chat
Hecho cuando: Sin 156.798.062, 2.200, 1,28%, «lo hacemos nosotros» ni −USD 3.000 en ventas/ y evergreen/ · SOP 08 · id del plan: S0.11'),
    ('EV0-12', 'Flywheel v1: clase del 17/11 sin oferta, precio ni lugares; CTA a CUENTA', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Santi', '2026-11-23', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Editor; Santi revisa
Hecho cuando: Programado para mar 24/11 10:00; números de hoy; Herbora sin suscripción · SOP 03 · id del plan: S0.12'),
    ('EV0-13', 'Fichas de historias y guiones de reels de la semana 1; escaleta VSL-01', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Santi', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi, Mati
Hecho cuando: Fichas con 1º/2º/3º; guiones con doble check y filtro de 4 preguntas · SOP 06 · id del plan: S0.13'),
    ('EV0-14', 'Planillas: historias, reels y trials, registro del setter, reporte por fases, semáforo', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Santi', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Hecho cuando: Links pegados en el §9 de la base 12 · SOP 05 · id del plan: S0.14'),
    ('EV0-15', 'Banco de fotos limpio y capturas [CARGAR] de la semana 1', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Santi', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi lista, Manu saca
Hecho cuando: Carpeta sin viajes, lujo ni marcas; capturas en Drive · SOP 07 · id del plan: S0.15'),
    ('EV0-16', 'Hype 1 del flywheel en historias', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'Manu', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Hecho cuando: 2 historias con «respondé CUENTA y te la mando»; respuestas anotadas · SOP 06 · id del plan: S0.16'),
    ('EV0-17', 'Formulario de onboarding a cada comprador del 17/11', 'Evergreen · Semana 0 · Alinear', 1, 'Por hacer', 'José', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Cuándo: el día del pago
Hecho cuando: Enviado; sin respuesta no hay primera sesión · SOP 04 · id del plan: S0.17'),
    ('EV1-01', 'Grabación extraordinaria: VSL-01, 4 reels, trial 1.2 y fotos', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Manu', '2026-11-23', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Manu; editor asiste
Hecho cuando: Crudo en Drive · SOP 03 · id del plan: S1.1'),
    ('EV1-02', 'Publicar y fijar el flywheel; bio y CUENTA apuntan a él', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Santi', '2026-11-24', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Editor; Santi
Hecho cuando: Video fijado, bio con el link, CUENTA probado · SOP 02 · id del plan: S1.2'),
    ('EV1-03', 'Plantilla de descripción de YouTube y descripción del canal', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Santi', '2026-11-23', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Hecho cuando: Plantilla aplicada al flywheel · SOP 03 · id del plan: S1.3'),
    ('EV1-04', 'Edición semana 1: reels diarios, VSL-01 del vie 27, clips', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', '', '2026-11-26', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Editor, clipping
Hecho cuando: Cada pieza lista 24 h antes de salir · SOP 05 · id del plan: S1.4'),
    ('EV1-05', 'Revisión antes de publicar con ficha 05, checklist 07 y reglas de la base 11', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Cuándo: antes de cada pieza
Hecho cuando: Nada sale sin la ficha · SOP 07 · id del plan: S1.5'),
    ('EV1-06', 'TikTok: 2 crudos por día sin CTA', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Manu', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Manu graba; sube quien defina D2
Cuándo: diario
Hecho cuando: 14 por semana con el dolor anotado · SOP 03 · id del plan: S1.6'),
    ('EV1-07', 'Ritual de los martes', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Santi', '2026-11-24', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Manu, José, Santi, Mati
Hecho cuando: 1 a 3 ajustes anotados · SOP 04 · id del plan: S1.7'),
    ('EV1-08', 'Guiones de la semana 2: VSL-09, video B, 7 reels, 3 ganchos de historias', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Santi', '2026-11-25', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi, Mati
Hecho cuando: Aprobados por Manu · SOP 05 · id del plan: S1.8'),
    ('EV1-09', 'Estudio: semana 2', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Manu', '2026-11-26', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Hecho cuando: Crudo en Drive · SOP 03 · id del plan: S1.9'),
    ('EV1-10', 'Ritual del sábado: dolor de la semana siguiente con frases del setter y del closer', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Santi', '2026-11-28', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Manu y José; Santi y Mati guionan
Hecho cuando: Dolor elegido con 3 frases textuales · SOP 04 · id del plan: S1.10'),
    ('EV1-11', 'Lectura de historias a 24 h y reels a 48 h y 7 días', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Cuándo: continuo
Hecho cuando: Planillas al día · SOP 05 · id del plan: S1.11'),
    ('EV1-12', 'Hipótesis de ángulo desde frases del setter → 1 trial de una variable', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Santi', '2026-11-27', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi; clipping
Hecho cuando: Trial con hipótesis escrita · SOP 05 · id del plan: S1.12'),
    ('EV1-13', 'Estándares cruzados: matemática inversa y KPI semanal', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Santi', '2026-12-01', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Manu, Santi, José, Mati
Hecho cuando: KPI escrito en el §7 · SOP 04 · id del plan: S1.13'),
    ('EV1-14', 'Resto del perfil: La cuenta, Por dentro, Resultados, Quién soy y 3 fijados', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Santi', '2026-11-29', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi, Mati
Hecho cuando: 5 destacadas en orden; Por dentro sin Lite · SOP 02 · id del plan: S1.14'),
    ('EV1-15', 'Correcciones prioridad 2', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Mati', '2026-11-29', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Hecho cuando: Ningún archivo en uso con datos viejos · SOP 09 · id del plan: S1.15'),
    ('EV1-16', 'Insights desde el 01/10 → la vara', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Santi', '2026-11-29', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi, Mati
Hecho cuando: Promedio provisorio cargado · SOP 06 · id del plan: S1.16'),
    ('EV1-17', 'Onboarding retroactivo y reporte del molde (Lopo, Núñez, Herbora)', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Manu', '2026-11-28', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: José, Manu
Hecho cuando: 3 reportes con primer y último contacto · SOP 04 · id del plan: S1.17'),
    ('EV1-18', 'Role play del closer leyendo una tienda; si no puede, S1 lo toman Manu o José', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Santi', '2026-11-28', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi, Mati
Hecho cuando: Decisión escrita · SOP 09 · id del plan: S1.18'),
    ('EV1-19', 'Estudio: semana 3 (VSL-02 con palabra CPA)', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Manu', '2026-12-03', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Hecho cuando: Crudo en Drive · SOP 03 · id del plan: S1.19'),
    ('EV1-20', 'Revisión de 2 semanas: S1 contra S2 y volumen de videos', 'Evergreen · Semanas 1-2 · Montar', 1, 'Por hacer', 'Santi', '2026-12-07', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi con Manu
Hecho cuando: Una página con lectura y decisión · SOP 03 · id del plan: S1.20'),
    ('EV2-01', 'Link de la Cuenta del CPA y palabra CPA en ManyChat', 'Evergreen · Semanas 3-8 · Operar', 1, 'Por hacer', 'Santi', '2026-12-06', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi, Mati
Hecho cuando: CPA devuelve video y recurso · SOP 03 · id del plan: S2.1'),
    ('EV2-02', 'Semana 3: S1 · dolor 2 CPA con el loop completo', 'Evergreen · Semanas 3-8 · Operar', 1, 'Por hacer', '', '2026-12-13', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Equipo
Hecho cuando: 2 videos, 7 reels, 7 secuencias, 1 pedido, 14 TikTok · SOP 03 · id del plan: S2.2'),
    ('EV2-03', 'Decisión S3: qué se le entrega dentro de OS', 'Evergreen · Semanas 3-8 · Operar', 1, 'Por hacer', 'Manu', '2026-12-10', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Hecho cuando: Semana 4 grabada en plan A (MARCA) o B (dolor 7, BASE) · SOP 04 · id del plan: S2.3'),
    ('EV2-04', 'Plan B: confirmar o armar el recurso BASE', 'Evergreen · Semanas 3-8 · Operar', 1, 'Por hacer', 'Santi', '2026-12-10', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Hecho cuando: Recurso que llega, o la palabra no se usa · SOP 03 · id del plan: S2.4'),
    ('EV2-05', 'Semana 4 publicada (plan A o B)', 'Evergreen · Semanas 3-8 · Operar', 1, 'Por hacer', '', '2026-12-20', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Equipo
Hecho cuando: Loop completo · SOP 03 · id del plan: S2.5'),
    ('EV2-06', 'Revisión de la ronda 1 por subavatar con 7 días de desfase', 'Evergreen · Semanas 3-8 · Operar', 1, 'Por hacer', 'Santi', '2026-12-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi, Manu, José
Hecho cuando: Una página y orden de la ronda 2 · SOP 04 · id del plan: S2.6'),
    ('EV2-07', 'Banco para fiestas: 2 videos, 14 reels y fichas; historias diarias igual', 'Evergreen · Semanas 3-8 · Operar', 1, 'Por hacer', 'Santi', '2026-12-17', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi, Manu
Hecho cuando: Banco en Drive; semanas 5–6 no cuentan para validar · SOP 06 · id del plan: S2.7'),
    ('EV2-08', 'Testeo de ángulos: trial → gana el que trae calificados → feed, título y flywheel', 'Evergreen · Semanas 3-8 · Operar', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi; clipping
Cuándo: cada viernes
Hecho cuando: Ganador por semana en la planilla · SOP 05 · id del plan: S2.8'),
    ('EV2-09', 'Flywheel v2 para el subavatar ganador', 'Evergreen · Semanas 3-8 · Operar', 1, 'Por hacer', 'Manu', '2027-01-09', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Manu, editor
Hecho cuando: Video fijado nuevo; el v1 queda en lista · SOP 03 · id del plan: S2.9'),
    ('EV2-10', 'Biblioteca: VSL-03 margen, VSL-04 pauta apagada, VSL-06 auditoría', 'Evergreen · Semanas 3-8 · Operar', 1, 'Por hacer', 'Santi', '2026-12-17', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Manu, Santi
Hecho cuando: Videos publicados con datos confirmados · SOP 03 · id del plan: S2.10'),
    ('EV2-11', 'Situación de la cuenta (alcance 30 días)', 'Evergreen · Semanas 3-8 · Operar', 1, 'Por hacer', 'Santi', '2026-12-07', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Hecho cuando: Situación confirmada o cambiada · SOP 03 · id del plan: S2.11'),
    ('EV2-12', 'Semáforo cada 5–10 ventas y feedback del día 30', 'Evergreen · Semanas 3-8 · Operar', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Mati, Santi, José
Cuándo: según ventas
Hecho cuando: Fila y decisión; respuestas textuales · SOP 08 · id del plan: S2.12'),
    ('EV2-13', 'Primer cliente de OS con primer cobro recurrente → Resultados', 'Evergreen · Semanas 3-8 · Operar', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Manu, Santi
Cuándo: cuando ocurra
Hecho cuando: Caso con captura y permiso · SOP 02 · id del plan: S2.13'),
    ('EV2-14', 'Revisión de 8 semanas contra los criterios de escalar', 'Evergreen · Semanas 3-8 · Operar', 1, 'Por hacer', 'Santi', '2027-01-18', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi con Manu
Hecho cuando: Decisión: escalar o una ronda más · SOP 03 · id del plan: S2.14'),
    ('ESC-01', 'Mini clase de 30–45 min en el grupo de WhatsApp sobre el dolor ganador', 'Evergreen · Escalar', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Manu, Santi, setter, closer
Cuándo: al cumplir §8
Hecho cuando: Aplicaciones y reportes de la mini clase · SOP 03 · id del plan: E.1'),
    ('ESC-02', 'El ángulo ganador pasa a clase o lead magnet propio', 'Evergreen · Escalar', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi, Manu
Cuándo: después de E.1
Hecho cuando: Recurso o clase publicada · SOP 05 · id del plan: E.2'),
    ('ESC-03', 'Pauta con reels orgánicos ganadores como creativos', 'Evergreen · Escalar', 1, 'Por hacer', 'Mati', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Cuándo: después de E.2
Hecho cuando: Creativos validados en orgánico · SOP 09 · id del plan: E.3'),
    ('ESC-04', 'Próximo lanzamiento con datos de la versión chica', 'Evergreen · Escalar', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Cuándo: después de E.3
Hecho cuando: Calendario con los 3 pedidos grandes primero · SOP 06 · id del plan: E.4'),
    ('ESC-05', 'Precio quieto hasta caso de tercero con suscripción y semáforo verde', 'Evergreen · Escalar', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §4', '', 'Quién: Santi, Manu
Cuándo: —
Hecho cuando: Decisión con datos · SOP 08 · id del plan: E.5'),
    ('DEC-01', 'Decidir: Volumen de YouTube', 'Evergreen · Decisiones', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Propuesta del plan: 2 por semana desde el arranque; el video B de las semanas 1–4 sale de material existente o del mismo jueves. Si un jueves no se llega, 1 (el martes) y nunca 0 (mínimo del SOP 03)'),
    ('DEC-02', 'Decidir: Quién sube TikTok', 'Evergreen · Decisiones', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Propuesta del plan: Clipping `[HIP]`, con los crudos que Manu graba en el celular'),
    ('DEC-03', 'Decidir: Palabras', 'Evergreen · Decisiones', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Propuesta del plan: CUENTA fija + una por video (PISO, CICLO, TRATAMIENTO, CPA, MARCA/BASE). SUSCRIPCIÓN y FLUJOS dejan de ser palabras'),
    ('DEC-04', 'Decidir: Quién contesta fuera de lanzamiento', 'Evergreen · Decisiones', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Propuesta del plan: ManyChat responde la palabra; el setter toma el WhatsApp de Manu el mismo día; Manu solo si le escriben a él'),
    ('DEC-05', 'Decidir: Plan de pagos de OS', 'Evergreen · Decisiones', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Propuesta del plan: Uno solo, escrito, que el closer no cambia'),
    ('DEC-06', 'Decidir: Cupo en evergreen', 'Evergreen · Decisiones', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Quién: Santi, Manu
Propuesta del plan: No se dice cupo si no hay un número real'),
    ('DEC-07', 'Decidir: «−USD 3.000» y «+$3B»', 'Evergreen · Decisiones', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Propuesta del plan: Afuera de todas las piezas'),
    ('DEC-08', 'Decidir: Fuente del flywheel v1', 'Evergreen · Decisiones', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Quién: Santi, Manu
Propuesta del plan: La grabación del 17/11 sin la oferta. Si no es usable: el mar 24/11 sale el VSL-01 y el flywheel se graba el jue 26/11 para el mar 01/12'),
    ('DEC-09', 'Decidir: Qué hace el setter con el que vende y tiene menos capital que OS', 'Evergreen · Decisiones', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Propuesta del plan: Pasa a llamada y el closer decide OS o Lite `[HIP]`'),
    ('DEC-10', 'Decidir: Qué se le entrega a S3', 'Evergreen · Decisiones', 1, 'Por hacer', 'Manu', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Propuesta del plan: Fecha tope jue 10/12; sin decisión, semana 4 plan B'),
    ('DEC-11', 'Decidir: Grupo de WhatsApp del 17/11', 'Evergreen · Decisiones', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Propuesta del plan: Se mantiene sin mensajes automáticos hasta reescribirlos; un mensaje por video `[HIP]`'),
    ('DEC-12', 'Decidir: Quién toma las llamadas de S1', 'Evergreen · Decisiones', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Quién: Santi, Manu
Propuesta del plan: Manu o José hasta que el closer pase el role play de leer una tienda'),
    ('DEC-13', 'Decidir: Horarios fijos', 'Evergreen · Decisiones', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Propuesta del plan: YouTube 10, historias 13, reels 20, TikTok 12 y 19 `[HIP]` hasta ver Insights'),
    ('COR-01', 'Corregir evergreen/vsl-chat/vsl-chat-genesis.md', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P1: «hecha/instalamos por nosotros» → con vos; 156.798.062/2.200/1,28% → 275.225.343/3.943/7,2%; «factura +30M» → vende hoy + capital; agenda → aplica; ban → renovar creativos; cierre como pregunta'),
    ('COR-02', 'Corregir evergreen/vsl-chat/pantalla-genesis.html', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P1: sacar el bonus «USD 3.000 de descuento»'),
    ('COR-03', 'Corregir ventas/oferta-genesis.html', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P1: sacar −USD 3.000; selector Lite nunca de entrada (versión solo OS para compartir); «sesiones ilimitadas» → lo de CONTEXTO; +$3M/+$2M con fuente o afuera'),
    ('COR-04', 'Corregir ventas/manual-llamada-de-venta-genesis.md', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P1: DFY → hecho con vos; lead 19/10 y +30M → vende hoy + capital; cuotas → plan único D5; Mentoría → Lite tras objeción de capital; números viejos; sin Billetera Abierta ni agendá; guion de precio'),
    ('COR-05', 'Corregir ventas/guion-de-llamada-genesis.md', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P1: lo mismo que el manual (líneas 19, 21, 29, 51, 59, 174, 261); apertura con la tienda del lead abierta'),
    ('COR-06', 'Corregir ventas/claude-recursos/conocimiento/genesis-contexto.md', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P1: números viejos y «50% con pauta apagada» sin confirmar (l.17); avatar Gonza (l.81) → avatar A y subavatares; si no, cada recurso sale con datos viejos'),
    ('COR-07', 'Corregir ventas/guion-sdr-clase-19-10.md', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P1: reemplazar por el guion del setter evergreen: aperturas por subavatar, 4 preguntas, un seguimiento, sin llamada en frío doble'),
    ('COR-08', 'Corregir lanzamientos/2026-11-17-webinar/whatsapp/flujo-wsp-api/ (GHL)', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P1: apagar post-clase («quedan 6 lugares», «hasta el sábado 21»); nada automático en el grupo hasta reescribirlo'),
    ('COR-09', 'Corregir evergreen/perfil-ig/optimizacion-perfil.md', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P2: bio con +$100M y SUSCRIPCIÓN, Gonza, «Programa no va», 3 destacadas → bio y destacadas de la base 12 y la 02'),
    ('COR-10', 'Corregir evergreen/perfil-ig/post-mecanismo.html', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P2: slides 1, 7 y 9 (día bueno, el mes arranca cobrado, Mandame CUENTA) + slide «lo armamos con vos, adentro de tu tienda»'),
    ('COR-11', 'Corregir evergreen/youtube/vsl-oculto-yt1.md', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P2: no listado → publicado; done for you y 3 meses → con vos, 4 meses; «se agenda» → WhatsApp con la palabra; CUENTA → CPA'),
    ('COR-12', 'Corregir evergreen/youtube/funnel-youtube.md', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P2: Gonza 30–80M y USD 6.000 → avatar A sin precio; done for you, 3 meses; ADENTRO → palabra por video; ordenar por dolor y flywheel'),
    ('COR-13', 'Corregir evergreen/vsl-chat/vsl-chat-genesis-lite.md', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P2: 2.200 → 3.943; «programa» afuera; solo lo manda el closer después de vender Lite'),
    ('COR-14', 'Corregir ventas/llamadas-b2b-b2c/ (01, 03, README)', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P2: DFY y «lo instalamos nosotros» (B2B-16); números viejos; cuotas → D5; B2B-01 con 5.000 ≈ 7,5M ARS ÷ 45.000 = ~167 clientes; objeciones como pregunta'),
    ('COR-15', 'Corregir ventas/proceso-de-ventas-clase-19-10.md y ventas/mapa-de-ventas.html', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P2: calificado «químico + 30M» → vende hoy + capital; 6.000 → 5.000; números viejos; agendá → aplicá; DFY → DWY'),
    ('COR-16', 'Corregir lanzamientos/2026-11-17-webinar/ventas-y-tracking/formulario-closer.md', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P2: +280M → más de 270 millones; role play leyendo una tienda y haciendo la cuenta del techo'),
    ('COR-17', 'Corregir lanzamientos/2026-11-17-webinar/mails/emails-nutricion.md', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P2 si se reusa: «cambió el modelo» sobre Lucas (l.134, 194) sin suscripción; +280M/+3.500 → números de hoy; +$100M como promesa afuera'),
    ('COR-18', 'Corregir lanzamientos/2026-11-17-webinar/whatsapp/whatsapp-nutricion.md y contenido-nutricion-dias-1-6.md', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'P2: «relanzaron con suscripción» (l.93) y «cambió el modelo» (l.236) → «nos metimos en la marca y los números se movieron»; 278 suscriptores sin fuente afuera'),
    ('COR-19', 'Corregir lanzamientos/2026-11-17-webinar/ads/ (adquisición y nutrición)', 'Evergreen · Correcciones de materiales', 1, 'Por hacer', 'Mati', '2026-11-22', '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §6', '', 'Antes de volver a pautar: N9 sin el caso de los 400 de Lucas; N1 retirado; O5 fuera del avatar; cada ad con subavatar; calificado del píxel = vende hoy + capital'),
    ('PTE-01', 'Transcripción de V1 y V2 (YouTube, Descript o el editor), para marcar los minutos `[MIN]` y escribir cada pieza con las palabras de Manu', 'Evergreen · Semana puente 21-28/11', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/13-semana-puente-21-28.md §5', '', 'Semana sin Manu: todo sale del video de pizarra y del de Miro.'),
    ('PTE-02', 'Confirmar si V1 o V2 ya están publicados', 'Evergreen · Semana puente 21-28/11', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/13-semana-puente-21-28.md §5', '', 'Semana sin Manu: todo sale del video de pizarra y del de Miro.'),
    ('PTE-03', 'Cortes de R1 a R3 (sábado a lunes)', 'Evergreen · Semana puente 21-28/11', 1, 'Por hacer', '', '2026-11-21', '', 'mi-negocio/bases/13-semana-puente-21-28.md §5', '', 'Quién: Editor
Semana sin Manu: todo sale del video de pizarra y del de Miro.'),
    ('PTE-04', 'Edición de V2 para YouTube y cortes R4–R5', 'Evergreen · Semana puente 21-28/11', 1, 'Por hacer', '', '2026-11-23', '', 'mi-negocio/bases/13-semana-puente-21-28.md §5', '', 'Quién: Editor
Semana sin Manu: todo sale del video de pizarra y del de Miro.'),
    ('PTE-05', 'Edición de V1 para YouTube y cortes R6–R8', 'Evergreen · Semana puente 21-28/11', 1, 'Por hacer', '', '2026-11-26', '', 'mi-negocio/bases/13-semana-puente-21-28.md §5', '', 'Quién: Editor
Semana sin Manu: todo sale del video de pizarra y del de Miro.'),
    ('PTE-06', 'ManyChat con CUENTA y PISO probado', 'Evergreen · Semana puente 21-28/11', 1, 'Por hacer', 'Santi', '2026-11-23', '', 'mi-negocio/bases/13-semana-puente-21-28.md §5', '', 'Semana sin Manu: todo sale del video de pizarra y del de Miro.'),
    ('PTE-07', 'Recurso que se manda con CUENTA (hoy: el video; la Cuenta del CPA cuando tenga link)', 'Evergreen · Semana puente 21-28/11', 1, 'Por hacer', 'Santi', '2026-11-23', '', 'mi-negocio/bases/13-semana-puente-21-28.md §5', '', 'Semana sin Manu: todo sale del video de pizarra y del de Miro.'),
    ('PTE-08', 'Aprobación de Manu del texto en pantalla de la semana', 'Evergreen · Semana puente 21-28/11', 1, 'Por hacer', 'Manu', '2026-11-20', '', 'mi-negocio/bases/13-semana-puente-21-28.md §5', '', 'Semana sin Manu: todo sale del video de pizarra y del de Miro.'),
    ('PTE-09', 'Quién toma las llamadas de la semana', 'Evergreen · Semana puente 21-28/11', 1, 'Por hacer', 'Santi', '2026-11-21', '', 'mi-negocio/bases/13-semana-puente-21-28.md §5', '', 'Quién: Santi y José
Semana sin Manu: todo sale del video de pizarra y del de Miro.'),
    ('PTE-10', 'Grabación de la semana del 30/11 (S2): domingo 29 o lunes 30', 'Evergreen · Semana puente 21-28/11', 1, 'Por hacer', 'Manu', null, '', 'mi-negocio/bases/13-semana-puente-21-28.md §5', '', 'Cuándo: Antes de irse, confirmar el día
Semana sin Manu: todo sale del video de pizarra y del de Miro.'),
    ('PEN-01', 'D1 volumen de YouTube (propuesta: 2/semana con video B de material existente)', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Santi'),
    ('PEN-02', 'D2 quién sube TikTok (propuesta: clipping)', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Santi'),
    ('PEN-03', 'D4 quién atiende WhatsApp de Manu y DMs fuera de lanzamiento; ManyChat activo', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Santi'),
    ('PEN-04', 'D5 plan de pagos único de OS', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Santi'),
    ('PEN-05', 'D6 cupo en evergreen (no se dice si no hay número real)', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Quién: Santi, Manu
Dato o decisión que falta. Responsable según el plan: Santi, Manu'),
    ('PEN-06', 'D7 −USD 3.000 y +$3B afuera', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Santi'),
    ('PEN-07', 'D8 grabación del 17/11 usable para el flywheel', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Quién: Santi, Manu
Dato o decisión que falta. Responsable según el plan: Santi, Manu'),
    ('PEN-08', 'D9 qué hace el setter con el que vende y tiene menos capital que OS', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Santi'),
    ('PEN-09', 'D10 qué se le entrega a S3 dentro de OS (tope jue 10/12)', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Manu', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Manu'),
    ('PEN-10', 'D11 grupo de WhatsApp del 17/11', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Santi'),
    ('PEN-11', 'D12 quién toma las llamadas de S1 hasta que el closer lea tiendas', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Quién: Santi, Manu
Dato o decisión que falta. Responsable según el plan: Santi, Manu'),
    ('PEN-12', '$X que se cobra el 1 de cada mes (VSL-01)', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Manu', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Manu'),
    ('PEN-13', 'Período y capturas de Herbora antes y después', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Manu', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Manu'),
    ('PEN-14', 'Frases [CONFIRMAR MANU] y capturas [CARGAR] de cada semana', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Manu', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Manu'),
    ('PEN-15', 'Link de la Cuenta del CPA y recurso BASE', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Santi'),
    ('PEN-16', 'KPI semanal y objetivo de ventas de diciembre', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Quién: Manu, Santi
Dato o decisión que falta. Responsable según el plan: Manu, Santi'),
    ('PEN-17', '% de cierre y de agendamiento reales del 17/11', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Quién: Mati, Santi
Dato o decisión que falta. Responsable según el plan: Mati, Santi'),
    ('PEN-18', 'Día 1 y semanas por fase para Por dentro', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Manu', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Quién: Manu, José
Dato o decisión que falta. Responsable según el plan: Manu, José'),
    ('PEN-19', '¿Trial Reels habilitado en IG?', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Santi'),
    ('PEN-20', 'Margen real X% y captura de pauta apagada', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Manu', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Manu'),
    ('PEN-21', 'Pedidos del sábado 26/12 y 02/01', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Santi'),
    ('PEN-22', 'Primer cliente OS con primer cobro recurrente', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Manu', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Manu'),
    ('PEN-23', 'Actualizar CONTEXTO.md con plan de pagos, cupo y link de la bio', 'Evergreen · Datos pendientes', 1, 'Por hacer', 'Santi', null, '', 'mi-negocio/bases/12-plan-de-accion-evergreen.md §10', '', 'Dato o decisión que falta. Responsable según el plan: Santi')
  ) as v (id, title, phase, quantity, status, responsible_name, due_date, agent, reference, link, notes)
  on conflict (id) do nothing
  returning id
)
insert into public.task_events (task_id, author_name, what)
select id, 'Sistema', 'Creó la tarea (carga del plan evergreen)' from nuevas;

