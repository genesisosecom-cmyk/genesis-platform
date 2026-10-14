# Genesis · Plataforma de contenido grabado

Plataforma para miembros de Genesis con estética *ambient gradient* oscura y color principal `#f0641f`.

- **Login** con acceso solo para miembros con licencia.
- **01 · Tu avance** — % del programa, lecciones/módulos completados, tiempo visto, "continuar donde lo dejaste" y progreso por módulo.
- **02 · Módulos** — listado de módulos, reproductor de video (YouTube, Vimeo, Loom o .mp4), lista de lecciones, navegación anterior/siguiente y "marcar como completada".
- **03 · Baúl de herramientas** — plantillas, recursos, software y prompts con filtro por categoría y búsqueda.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build de producción en dist/
```

Usuario de demo: `demo@genesis.com` / `genesis2026`

## Cargar contenido

| Qué | Dónde |
| --- | --- |
| Módulos, lecciones y videos (`videoUrl`) | `src/data/content.ts` → `MODULES` |
| Herramientas del baúl | `src/data/content.ts` → `TOOLS` |
| Miembros (auth local) y link de "Solicitar acceso" | `src/data/members.ts` |
| Colores y estilos | `src/styles.css` (variables en `:root`) |

## Antes de producción

La autenticación y el progreso actuales son **locales** (localStorage) para poder probar la plataforma sin backend.
No son seguros para producción: cualquiera con acceso al código podría ver las credenciales.
Para lanzar, reemplazá `src/auth/authService.ts` por un proveedor real (p. ej. Supabase Auth) manteniendo la misma
interfaz (`login`, `logout`, `getSession`), y guardá el progreso en la base de datos en lugar de localStorage
(`src/progress/ProgressContext.tsx`). También conviene que los videos estén en un hosting privado (Vimeo privado,
Mux, Bunny Stream) para que no se puedan compartir fuera de la plataforma.

## Deploy

Incluye `vercel.json` con el rewrite necesario para las rutas del SPA.
