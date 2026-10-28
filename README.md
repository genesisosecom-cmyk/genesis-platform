# Genesis · Campus, formularios pre-llamada y panel de superadmin

React + Vite + Supabase. Estética *ambient gradient* oscura con color principal `#f0641f`.

## Qué incluye

**Campus (miembros)**
- Login con Supabase Auth (sin registro público: los usuarios los crea el superadmin) y recuperación de contraseña.
- **01 · Tu avance**, **02 · Módulos** (videos + marcar lecciones como completadas) y **03 · Baúl de herramientas**.
- El progreso se guarda por usuario en la base de datos.

**Formularios pre-clase** — `/f/<link>` (principal: `/f/pre-clase`)
- Formato paso a paso, una pantalla por pregunta, con atajos de teclado (Enter, letras A/B/C) y barra de progreso.
- Pre-clase: ¿Quién sos? → programa (Genesis OG, Fast Subscription, Genesis OS) → clase y fecha según la agenda de ese programa → preguntas (las que quiera) → enviar.
- También se pueden armar formularios personalizados (texto corto, texto largo, opción única y escala).
- No hace falta cuenta para responder.

**Panel de superadmin** — `/admin` (solo usuarios con rol `superadmin`)
- **Contenido:** crear, ordenar, publicar/ocultar y eliminar módulos y lecciones. Cada módulo se puede dividir en **secciones** (ej: "Búsqueda y validación de producto") con sus clases; en el campus la lista de clases se agrupa por sección. Cada lección lleva el link del video (YouTube no listado, Vimeo, Loom, Bunny o .mp4), duración, descripción y **recursos de la clase** (archivos descargables de hasta 50 MB o links, con título y descripción corta), con vista previa.
- **Herramientas:** baúl de herramientas con archivos subidos (bucket privado `toolbox`, hasta 50 MB) o links externos; borrador/publicada y orden.
- **Resumen:** usuarios activos, avance promedio, respuestas sin leer, cobrado en el mes, cuotas vencidas y próximos cobros.
- **Usuarios:** avance de cada alumno por módulo, última actividad y formularios respondidos. Alta de usuarios (miembro o admin) con contraseña temporal de 10 minutos y botón para copiar los datos de acceso; en el primer ingreso el usuario elige su contraseña. También se puede regenerar la contraseña temporal, quitar acceso, dar rol admin y eliminar usuarios.
- **Respuestas:** bandeja filtrable por próximas clases, coach y estado; vista de cada respuesta con sus preguntas, "marcar como leída", notas internas y eliminar.
- **Formularios:** crear/editar formularios y los textos de la pantalla de inicio, copiar el link, pausar/activar.
- **Agenda:** clases grupales semanales y 1:1 a pedido, con qué programas acceden a cada una.
- **Finanzas:** por mes, año o todo: facturación (contrato completo en el mes del primer pago del cliente), cash collected, gastos (únicos o mensuales recurrentes), comisiones y fijos del equipo, resultado neto, reparto a socios y lo que queda en la empresa. Cuánto le corresponde a cada miembro, pagos registrados y saldo pendiente. Las comisiones se asignan por cliente (% sobre lo cobrado). Todo en USD.
- **Clientes y pagos:** ficha de cada cliente (programa, estado, fechas, contacto), plan de cuotas generado automáticamente, registrar pagos, deuda vencida, próximos vencimientos, y su avance en el campus y sus formularios.

Los clientes, usuarios y respuestas se vinculan por email automáticamente.

## Puesta en marcha

Proyecto actual: `genesis-platform` (`zanwrwysbmvgytfzymaz`, São Paulo). Los pasos 1 y 2 ya están aplicados.

1. **Base de datos:** ejecutá los archivos de `supabase/migrations/` en orden (SQL Editor o `supabase db push`). Crean las tablas, las políticas RLS y dos formularios de ejemplo.
2. **Edge Function:** desplegá `supabase/functions/admin-users` (`supabase functions deploy admin-users`). Es la que permite al admin crear usuarios.
3. **Auth:** en *Authentication → Sign In / Providers* desactivá *Allow new users to sign up*. En *URL Configuration* agregá la URL del sitio y `https://TU-DOMINIO/actualizar-clave` como redirect.
4. **Primer superadmin:** creá el usuario en *Authentication → Users → Add user* y después ejecutá:
   ```sql
   update public.profiles set role = 'superadmin' where email = 'manu@…';
   ```
5. **Frontend:** copiá `.env.example` a `.env` con la URL y la anon/publishable key del proyecto.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build de producción en dist/
```

En Vercel, cargá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` como variables de entorno. `vercel.json` ya tiene el rewrite para las rutas del SPA.

## Seguridad

- Las contraseñas temporales vencen a los 10 minutos: una tarea de `pg_cron` las invalida cada minuto y cierra las sesiones abiertas con ellas. Mientras un admin no cambie su contraseña temporal, no tiene permisos de admin.

- Todas las tablas tienen RLS: un miembro solo ve su perfil, su progreso y sus respuestas; clientes y pagos son solo para superadmin.
- Los formularios activos son públicos para leer y responder; las respuestas solo las lee el superadmin (o el propio usuario si respondió logueado).
- La service role key solo se usa dentro de la Edge Function, nunca en el navegador.

## Contenido

| Qué | Dónde |
| --- | --- |
| Módulos, lecciones y videos | Panel → Contenido (tablas `modules` y `lessons`) |
| Herramientas del baúl | Panel → Herramientas (tabla `tools` + bucket `toolbox`) |
| Link de "Solicitar acceso" | `src/config.ts` |
| Colores y estilos | `src/styles.css` (variables en `:root`) |
