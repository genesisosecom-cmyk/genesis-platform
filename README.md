# Genesis · Campus, formularios pre-llamada y panel de superadmin

React + Vite + Supabase. Estética *ambient gradient* oscura con color principal `#f0641f`.

## Qué incluye

**Campus (miembros)**
- Login con Supabase Auth (sin registro público: los usuarios los crea el superadmin) y recuperación de contraseña.
- **01 · Tu avance**, **02 · Módulos** (videos + marcar lecciones como completadas) y **03 · Baúl de herramientas**.
- El progreso se guarda por usuario en la base de datos.

**Formularios pre-llamada** — `/f/<link>`
- Manu le manda el link al cliente antes de la llamada grupal o 1:1. No hace falta cuenta para responder.
- Preguntas configurables: texto corto, texto largo, opción única y escala.

**Panel de superadmin** — `/admin` (solo usuarios con rol `superadmin`)
- **Resumen:** usuarios activos, avance promedio, respuestas sin leer, cobrado en el mes, cuotas vencidas y próximos cobros.
- **Usuarios:** avance de cada alumno por módulo, última actividad, formularios respondidos, alta de usuarios, quitar acceso, cambiar contraseña y dar rol admin.
- **Respuestas:** bandeja de formularios con filtros, vista de cada respuesta, "marcar como leída" y notas internas para preparar la llamada.
- **Formularios:** crear/editar formularios, copiar el link, pausar/activar.
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

- Todas las tablas tienen RLS: un miembro solo ve su perfil, su progreso y sus respuestas; clientes y pagos son solo para superadmin.
- Los formularios activos son públicos para leer y responder; las respuestas solo las lee el superadmin (o el propio usuario si respondió logueado).
- La service role key solo se usa dentro de la Edge Function, nunca en el navegador.

## Contenido

| Qué | Dónde |
| --- | --- |
| Módulos, lecciones y videos (`videoUrl`) | `src/data/content.ts` → `MODULES` |
| Herramientas del baúl | `src/data/content.ts` → `TOOLS` |
| Link de "Solicitar acceso" | `src/config.ts` |
| Colores y estilos | `src/styles.css` (variables en `:root`) |
