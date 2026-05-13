import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { login } from "@/api/auth";
import { api } from "@/api/client";
import { setAvatarUrl } from "@/components/kanban/Avatar";
import { LoginPage } from "@/pages/LoginPage";
import { KanbanPage } from "@/pages/KanbanPage";
import { ThemeProvider } from "@/theme/ThemeContext";
import type { User, ProjectRole } from "@/types/domain";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

interface ProjectWithRole {
  id: number;
  name: string;
  slug: string;
  color: string;
  role: ProjectRole;
}

function AppInner() {
  const { user, setAuth, setProjectRoles } = useAuthStore();
  const [restoring, setRestoring] = useState(true);

  // Restore session from localStorage token on mount
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token && !user) {
      api.get<User>("/me")
        .then(async (me) => {
          const projects = await api.get<ProjectWithRole[]>("/projects");
          const roles: Record<number, ProjectRole> = {};
          for (const p of projects) roles[p.id] = p.role;
          setAuth(me, token);
          setProjectRoles(roles);
          // Sync avatar from server to localStorage so it's available cross-device
          if (me.avatar_data) setAvatarUrl(me.id, me.avatar_data);
        })
        .catch(() => { localStorage.removeItem("token"); })
        .finally(() => setRestoring(false));
    } else {
      setRestoring(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async (email: string, password?: string) => {
    const token = await login(email, password);
    const me = await api.get<User>("/me");
    const projects = await api.get<ProjectWithRole[]>("/projects");

    const roles: Record<number, ProjectRole> = {};
    for (const p of projects) {
      roles[p.id] = p.role;
    }

    setAuth(me, token);
    setProjectRoles(roles);
    if (me.avatar_data) setAvatarUrl(me.id, me.avatar_data);
  };

  if (restoring) return null; // brief blank screen while restoring session
  if (!user) return <LoginPage onLogin={handleLogin} />;
  return <KanbanPage />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
