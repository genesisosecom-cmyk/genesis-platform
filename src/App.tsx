import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import AmbientBackground from './components/AmbientBackground';
import AppLayout from './components/AppLayout';
import RequireAuth from './auth/RequireAuth';
import LoginPage from './pages/LoginPage';
import UpdatePasswordPage from './pages/UpdatePasswordPage';
import PublicFormPage from './pages/PublicFormPage';
import HubPage from './pages/HubPage';
import ProgressPage from './pages/ProgressPage';
import ModulesPage from './pages/ModulesPage';
import ModuleDetailPage from './pages/ModuleDetailPage';
import ToolboxPage from './pages/ToolboxPage';
import AdminLayout from './admin/AdminLayout';
import OverviewPage from './admin/OverviewPage';
import UsersPage from './admin/UsersPage';
import ResponsesPage from './admin/ResponsesPage';
import ResponseDetailPage from './admin/ResponseDetailPage';
import FormsPage from './admin/FormsPage';
import ClientsPage from './admin/ClientsPage';
import ClientDetailPage from './admin/ClientDetailPage';
import AgendaPage from './admin/AgendaPage';
import ContentAdminPage from './admin/ContentAdminPage';
import ToolsAdminPage from './admin/ToolsAdminPage';
import FinancePage from './admin/finance/FinancePage';
import LeadsPage from './admin/leads/LeadsPage';
import AdminLeadPage from './admin/leads/AdminLeadPage';
import MetricsPage from './admin/leads/MetricsPage';
import TeamPage from './admin/team/TeamPage';
import SdrPage from './crm/SdrPage';
import SdrLeadPage from './crm/SdrLeadPage';
import CloserPage from './crm/CloserPage';
import CallPage from './crm/CallPage';
import FullScreenMessage from './components/FullScreenMessage';
import { isSupabaseConfigured } from './lib/supabase';

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <>
        <AmbientBackground />
        <FullScreenMessage
          title="Falta configurar Supabase"
          text="Creá un archivo .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example) y reiniciá el servidor."
        />
      </>
    );
  }

  return (
    <>
      <AmbientBackground />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/actualizar-clave" element={<UpdatePasswordPage />} />
        <Route path="/f/:slug" element={<PublicFormPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route
            element={
              <RequireAuth area="campus">
                <Outlet />
              </RequireAuth>
            }
          >
            <Route index element={<HubPage />} />
            <Route path="avance" element={<ProgressPage />} />
            <Route path="modulos" element={<ModulesPage />} />
            <Route path="modulos/:moduleId" element={<ModuleDetailPage />} />
            <Route path="modulos/:moduleId/:lessonId" element={<ModuleDetailPage />} />
            <Route path="herramientas" element={<ToolboxPage />} />
          </Route>
          <Route path="sdr" element={<RequireAuth area="sdr"><SdrPage /></RequireAuth>} />
          <Route path="sdr/:leadLaunchId" element={<RequireAuth area="sdr"><SdrLeadPage /></RequireAuth>} />
          <Route path="closer" element={<RequireAuth area="closer"><CloserPage /></RequireAuth>} />
          <Route path="closer/:callId" element={<RequireAuth area="closer"><CallPage /></RequireAuth>} />
          <Route
            path="admin"
            element={
              <RequireAuth area="admin">
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="usuarios" element={<UsersPage />} />
            <Route path="respuestas" element={<ResponsesPage />} />
            <Route path="respuestas/:responseId" element={<ResponseDetailPage />} />
            <Route path="formularios" element={<FormsPage />} />
            <Route path="agenda" element={<AgendaPage />} />
            <Route path="contenido" element={<ContentAdminPage />} />
            <Route path="herramientas" element={<ToolsAdminPage />} />
            <Route path="clientes" element={<ClientsPage />} />
            <Route path="clientes/:clientId" element={<ClientDetailPage />} />
            <Route path="finanzas" element={<FinancePage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="leads/:leadLaunchId" element={<AdminLeadPage />} />
            <Route path="metricas" element={<MetricsPage />} />
            <Route path="equipo" element={<TeamPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
