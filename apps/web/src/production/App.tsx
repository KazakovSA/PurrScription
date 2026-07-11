import { Navigate, Route, Routes } from "react-router-dom";
import { useAppStore } from "./store";
import { AdminPage, AnalyticsPage, TermsPage } from "./UtilityPages";
import { LoginPage } from "./LoginPage";
import { ProfilePage } from "./ProfilePage";
import { ProjectsPage } from "./ProjectsPage";
import { RegisterPage } from "./RegisterPage";
import { TasksPage } from "./TasksPage";
import { WorkspacePage } from "./WorkspacePage";
function Protected({ children }: { children: React.ReactNode }) {
  return useAppStore((s) => s.user) ? (
    children
  ) : (
    <Navigate to="/login" replace />
  );
}
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/projects"
        element={
          <Protected>
            <ProjectsPage />
          </Protected>
        }
      />
      <Route
        path="/tasks"
        element={
          <Protected>
            <TasksPage />
          </Protected>
        }
      />
      <Route
        path="/tasks/:id/workspace"
        element={
          <Protected>
            <WorkspacePage />
          </Protected>
        }
      />
      <Route
        path="/terms"
        element={
          <Protected>
            <TermsPage />
          </Protected>
        }
      />
      <Route
        path="/analytics"
        element={
          <Protected>
            <AnalyticsPage />
          </Protected>
        }
      />
      <Route
        path="/profile"
        element={
          <Protected>
            <ProfilePage />
          </Protected>
        }
      />
      <Route
        path="/admin"
        element={
          <Protected>
            <AdminPage />
          </Protected>
        }
      />
      <Route
        path="*"
        element={
          <Navigate
            to={useAppStore.getState().user ? "/projects" : "/login"}
            replace
          />
        }
      />
    </Routes>
  );
}
