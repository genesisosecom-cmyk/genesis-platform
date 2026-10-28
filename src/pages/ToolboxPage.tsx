import { useMemo, useState } from 'react';
import { useContent } from '../content/ContentContext';
import { openFileOrLink } from '../content/files';
import { External } from '../components/Icons';

const ALL = 'Todas';

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
          <button key={t.id} type="button" onClick={() => openFileOrLink(t)} className="glass tool-card tool-card--btn">
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
