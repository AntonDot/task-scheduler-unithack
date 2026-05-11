import { useState, useCallback, useMemo, useEffect, useSyncExternalStore } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchProjects } from '@/api/projects';
import { fetchTasks, changeStatus, createTask } from '@/api/tasks';
import { fetchProjectMembers } from '@/api/members';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeContext';
import { useToast } from '@/hooks/useToast';
import { Sidebar, type AppView } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { KanbanBoard } from '@/components/kanban/KanbanBoard';
import { CreateTaskModal } from '@/components/kanban/CreateTaskModal';
import { ToastContainer } from '@/components/ui/Toast';
import { AnalyticsView } from '@/pages/AnalyticsView';
import { TeamView } from '@/pages/TeamView';
import { SettingsView } from '@/pages/SettingsView';
import { AutomationsView } from '@/pages/AutomationsView';
import { MobileApp } from '@/components/mobile/MobileApp';
import type { Task, TaskStatus } from '@/types/domain';
import type { DesignColumn } from '@/theme/theme';
import { columnToStatus } from '@/theme/theme';

function useIsMobile() {
  return useSyncExternalStore(
    cb => {
      const mq = window.matchMedia('(max-width: 640px)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia('(max-width: 640px)').matches,
    () => false,
  );
}

export function KanbanPage() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileApp />;
  return <DesktopKanbanPage />;
}

function DesktopKanbanPage() {
  const { theme, isDark, toggleTheme, accentColor, setAccentColor } = useTheme();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { toasts, removeToast } = useToast();

  const [view,             setView]            = useState<AppView>('kanban');
  const [activeProjectId,  setActiveProjectId]  = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showCreate,       setShowCreate]       = useState(false);
  const [createColumn,     setCreateColumn]     = useState<DesignColumn>('backlog');
  const [search,           setSearch]           = useState('');
  const [syncing,          setSyncing]          = useState(false);
  const [compact]          = useState(false);
  const [colWidth]         = useState(300);

  const accent = accentColor;

  // Periodic sync pulse
  useEffect(() => {
    const id = setInterval(() => {
      setSyncing(true);
      setTimeout(() => setSyncing(false), 1400);
    }, 22000);
    return () => clearInterval(id);
  }, []);

  // Update body background when theme changes
  useEffect(() => {
    document.body.style.background = theme.bg;
    document.body.style.color = theme.text;
  }, [theme]);

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });

  const resolvedProjectId = activeProjectId ?? projects[0]?.id ?? null;
  const tasksKey = ['tasks', resolvedProjectId] as const;

  const { data: tasks = [] } = useQuery({
    queryKey: tasksKey,
    queryFn: () => fetchTasks(resolvedProjectId!),
    enabled: !!resolvedProjectId,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members', resolvedProjectId],
    queryFn: () => fetchProjectMembers(resolvedProjectId!),
    enabled: !!resolvedProjectId,
  });

  // Filter tasks by search
  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks;
    const lower = search.toLowerCase();
    return tasks.filter(t =>
      t.title.toLowerCase().includes(lower) ||
      (t.description?.toLowerCase().includes(lower) ?? false)
    );
  }, [tasks, search]);

  // Status change mutation
  const statusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: TaskStatus }) =>
      changeStatus(taskId, status),
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: tasksKey });
      const prev = queryClient.getQueryData<Task[]>(tasksKey);
      queryClient.setQueryData<Task[]>(tasksKey, old =>
        (old || []).map(t => t.id === taskId ? { ...t, status, updated_at: new Date().toISOString() } : t)
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) queryClient.setQueryData(tasksKey, ctx.prev); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', resolvedProjectId] });
      setSyncing(true);
      setTimeout(() => setSyncing(false), 1200);
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof createTask>[1]) => createTask(resolvedProjectId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', resolvedProjectId] });
      setShowCreate(false);
      setSyncing(true);
      setTimeout(() => setSyncing(false), 800);
    },
  });

  const handleStatusChange = useCallback((taskId: number, col: DesignColumn) => {
    const status = columnToStatus(col) as TaskStatus;
    statusMutation.mutate({ taskId, status });
  }, [statusMutation]);

  const handleUpdate = useCallback((updated: Task) => {
    queryClient.setQueryData<Task[]>(tasksKey, old =>
      (old || []).map(t => t.id === updated.id ? updated : t)
    );
  }, [queryClient, tasksKey]);

  if (!user) return null;

  const activeProject = projects.find(p => p.id === resolvedProjectId) ?? null;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: theme.bg, fontFamily: "'Inter', -apple-system, sans-serif", color: theme.text }}>
      <Sidebar
        view={view} setView={setView}
        projects={projects}
        activeProjectId={resolvedProjectId}
        setActiveProjectId={id => setActiveProjectId(id)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
        syncing={syncing} accent={accent} theme={theme}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <Header
          view={view}
          search={search} setSearch={setSearch}
          onAddTask={() => setShowCreate(true)}
          accent={accent} theme={theme}
          darkMode={isDark} onToggleDark={toggleTheme}
          members={members}
        />

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: theme.bg }}>
          {view === 'kanban' && (
            <KanbanBoard
              tasks={filteredTasks}
              members={members}
              onStatusChange={handleStatusChange}
              onUpdate={handleUpdate}
              onAddTask={col => { setCreateColumn(col); setShowCreate(true); }}
              accent={accent}
              compact={compact}
              colWidth={colWidth}
              theme={theme}
            />
          )}
          {view === 'automations' && <AutomationsView accent={accent} theme={theme} />}
          {view === 'analytics'   && <AnalyticsView tasks={tasks} accent={accent} theme={theme} />}
          {view === 'team'        && <TeamView tasks={tasks} members={members} accent={accent} theme={theme} />}
          {view === 'settings'    && (
            <SettingsView
              accent={accent} theme={theme}
              darkMode={isDark} onToggleDark={toggleTheme}
              accentColor={accentColor} setAccentColor={setAccentColor}
            />
          )}
        </div>
      </div>

      {showCreate && resolvedProjectId && (
        <CreateTaskModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreate={body => createMutation.mutate(body)}
          loading={createMutation.isPending}
          members={members}
          project={activeProject}
          accentColor={accent}
          theme={theme}
          initialColumn={createColumn}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
