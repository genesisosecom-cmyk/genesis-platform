import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/admin', label: 'Resumen', end: true },
  { to: '/admin/leads', label: 'Leads' },
  { to: '/admin/usuarios', label: 'Usuarios' },
  { to: '/admin/contenido', label: 'Contenido' },
  { to: '/admin/herramientas', label: 'Herramientas' },
  { to: '/admin/respuestas', label: 'Respuestas' },
  { to: '/admin/formularios', label: 'Formularios' },
  { to: '/admin/agenda', label: 'Agenda' },
  { to: '/admin/clientes', label: 'Clientes y pagos' },
  { to: '/admin/finanzas', label: 'Finanzas' },
];

export default function AdminLayout() {
  return (
    <div className="fade-in">
      <header className="page__header">
        <span className="eyebrow">Superadmin</span>
        <h1 className="page__title">Panel de control</h1>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="tabs__link">
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
