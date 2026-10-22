import { useMemo, useState } from 'react';
import { useContent } from '../content/ContentContext';
import { toolFileUrl } from '../content/api';
import type { Tool } from '../data/content';
import { External } from '../components/Icons';

const ALL = 'Todas';

/** Abre la herramienta: archivo privado (link temporal) o link externo. */
async function openTool(tool: Tool) {
  if (tool.filePath) {
    // Se abre la pestaña antes del await para que el navegador no la bloquee.
    const win = window.open('', '_blank');
    try {
      const url = await toolFileUrl(tool.filePath);
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch {
      win?.close();
      window.alert('No se pudo abrir el archivo. Probá de nuevo.');
    }
  } else if (tool.url) {
    window.open(tool.url, '_blank', 'noopener');
  }
}

export default function ToolboxPage() {
  const { tools: TOOLS, loading } = useContent();
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState('');
  const categories = useMemo(() => [ALL, ...new Set(TOOLS.map((t) => t.category))], [TOOLS]);

  const q = query.trim().toLowerCase();
  const tools = TOOLS.filter(
    (t) =>
      (category === ALL || t.category === category) &&
      (!q || `${t.name} ${t.description}`.toLowerCase().includes(q)),
  );

  return (
    <div className="fade-in">
      <header className="page__header">
        <span className="eyebrow">03 · Baúl de herramientas</span>
        <h1 className="page__title">Herramientas</h1>
        <p className="page__lead">Plantillas, recursos y software para aplicar lo que aprendés.</p>
      </header>

      <div className="toolbar">
        <div className="chips" role="tablist">
          {categories.map((c) => (
            <button key={c} role="tab" aria-selected={c === category} className={`chip${c === category ? ' is-active' : ''}`} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <input className="field field--search" type="search" placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="grid">
        {tools.map((t) => (
          <button key={t.id} type="button" onClick={() => openTool(t)} className="glass tool-card tool-card--btn">
            <div className="tool-card__top">
              <span className="badge badge--soft">{t.type}</span>
              <span className="tool-card__ext">{t.filePath ? 'Descargar' : <External width={16} height={16} />}</span>
            </div>
            <h2 className="tool-card__title">{t.name}</h2>
            <p className="muted">{t.description}</p>
            <span className="eyebrow">{t.category}</span>
          </button>
        ))}
        {!loading && !tools.length && <p className="muted">{TOOLS.length ? 'No hay herramientas que coincidan con tu búsqueda.' : 'Todavía no hay herramientas publicadas.'}</p>}
      </div>
    </div>
  );
}
