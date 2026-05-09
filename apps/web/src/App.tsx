import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { login } from "@/api/auth";
import { api } from "@/api/client";
import { LoginPage } from "@/pages/LoginPage";
import { KanbanPage } from "@/pages/KanbanPage";
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
  };

  if (!user) return <LoginPage onLogin={handleLogin} />;
  return <KanbanPage />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}

export default App;
