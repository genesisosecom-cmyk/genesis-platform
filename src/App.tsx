import { Navigate, Route, Routes } from 'react-router-dom';
import AmbientBackground from './components/AmbientBackground';
import AppLayout from './components/AppLayout';
import RequireAuth from './auth/RequireAuth';
import LoginPage from './pages/LoginPage';
import HubPage from './pages/HubPage';
import ProgressPage from './pages/ProgressPage';
import ModulesPage from './pages/ModulesPage';
import ModuleDetailPage from './pages/ModuleDetailPage';
import ToolboxPage from './pages/ToolboxPage';

export default function App() {
  return (
    <>
      <AmbientBackground />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
