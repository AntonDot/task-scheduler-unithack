import { useState, useCallback, useMemo, useEffect, useSyncExternalStore } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchProjects } from '@/api/projects';
import { fetchTasks, changeColumn, createTask } from '@/api/tasks';
import { fetchColumns } from '@/api/columns';
import { fetchProjectMembers } from '@/api/members';
import { setAvatarUrl } from '@/components/kanban/Avatar';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeContext';
import { useToast } from '@/hooks/useToast';
import { Sidebar, type AppView } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { KanbanBoard } from '@/components/kanban/KanbanBoard';
import { CreateTaskModal } from '@/components/kanban/CreateTaskModal';
import { ColumnsManagerModal } from '@/components/kanban/ColumnsManagerModal';
import { ToastContainer } from '@/components/ui/Toast';
import { AnalyticsView } from '@/pages/AnalyticsView';
import { TeamView } from '@/pages/TeamView';
import { SettingsView } from '@/pages/SettingsView';
import { AutomationsView } from '@/pages/AutomationsView';
import { MobileApp } from '@/components/mobile/MobileApp';
import type { Task } from '@/types/domain';

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
  const { user, clearAuth, projectRoles } = useAuthStore();
  const queryClient = useQueryClient();
  const { toasts, removeToast } = useToast();

  const [view,             setView]            = useState<AppView>('kanban');
  const [activeProjectId,  setActiveProjectId]  = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showCreate,       setShowCreate]       = useState(false);
  const [createColumn,     setCreateColumn]     = useState<number | null>(null);
  const [search,           setSearch]           = useState('');
  const [syncing,          setSyncing]          = useState(false);
  const [compact]          = useState(false);
  const [colWidth]         = useState(300);
  const [showColumnsManager, setShowColumnsManager] = useState(false);
  const [notifTarget, setNotifTarget] = useState<{ taskId: number; section?: 'comments' | 'description' } | null>(null);

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

  // Seed avatar cache from member avatar_data returned by the server
  useEffect(() => {
    members.forEach(m => {
      if (m.avatar_data) setAvatarUrl(m.id, m.avatar_data);
    });
  }, [members]);

  const { data: columns = [] } = useQuery({
    queryKey: ['columns', resolvedProjectId],
    queryFn: () => fetchColumns(resolvedProjectId!),
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

  // Column change mutation
  const columnMutation = useMutation({
    mutationFn: ({ taskId, column_id }: { taskId: number; column_id: number }) =>
      changeColumn(taskId, column_id),
    onMutate: async ({ taskId, column_id }) => {
      await queryClient.cancelQueries({ queryKey: tasksKey });
      const prev = queryClient.getQueryData<Task[]>(tasksKey);
      queryClient.setQueryData<Task[]>(tasksKey, old =>
        (old || []).map(t => t.id === taskId ? { ...t, column_id, updated_at: new Date().toISOString() } : t)
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

  const handleColumnChange = useCallback((taskId: number, column_id: number) => {
    columnMutation.mutate({ taskId, column_id });
  }, [columnMutation]);

  const handleUpdate = useCallback((updated: Task) => {
    queryClient.setQueryData<Task[]>(tasksKey, old =>
      (old || []).map(t => t.id === updated.id ? updated : t)
    );
  }, [queryClient, tasksKey]);

  const handleTaskDelete = useCallback((taskId: number) => {
    queryClient.setQueryData<Task[]>(tasksKey, old => (old ?? []).filter(t => t.id !== taskId));
  }, [queryClient, tasksKey]);

  if (!user) return null;

  const activeProject = projects.find(p => p.id === resolvedProjectId) ?? null;
  const isLead = resolvedProjectId ? projectRoles[resolvedProjectId] === 'OWNER' : false;


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
        onLogout={clearAuth}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <Header
          view={view}
          search={search} setSearch={setSearch}
          onAddTask={() => setShowCreate(true)}
          accent={accent} theme={theme}
          darkMode={isDark} onToggleDark={toggleTheme}
          members={members}
          onOpenTask={(taskId, section) => {
            setView('kanban');
            setNotifTarget({ taskId, section });
          }}
          onManageColumns={isLead && resolvedProjectId ? () => setShowColumnsManager(true) : undefined}

        />

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: theme.bg }}>
          {view === 'kanban' && (
            <KanbanBoard
              tasks={filteredTasks}
              columns={columns}
              members={members}
              onColumnChange={handleColumnChange}
              onUpdate={handleUpdate}
              onDelete={handleTaskDelete}
              onAddTask={col => { setCreateColumn(col); setShowCreate(true); }}
              accent={accent}
              compact={compact}
              colWidth={colWidth}
              theme={theme}
              openTaskId={notifTarget?.taskId ?? null}
              openTaskSection={notifTarget?.section}
              onTaskOpened={() => setNotifTarget(null)}
            />
          )}
          {view === 'automations' && <AutomationsView projectId={resolvedProjectId!} accent={accent} theme={theme} />}
          {view === 'analytics'   && <AnalyticsView tasks={tasks} columns={columns} accent={accent} theme={theme} />}
          {view === 'team'        && <TeamView tasks={tasks} members={members} accent={accent} theme={theme} doneColumnId={(() => { const s = [...columns].sort((a,b)=>a.order-b.order); return s[s.length-1]?.id; })()} />}
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
          isLead={isLead}
          columns={columns}
          accentColor={accent}
          theme={theme}
          initialColumn={createColumn}
        />
      )}

      {showColumnsManager && resolvedProjectId && (
        <ColumnsManagerModal
          open={showColumnsManager}
          onClose={() => setShowColumnsManager(false)}
          projectId={resolvedProjectId}
          columns={columns}
          theme={theme}
          accent={accent}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
