import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchProjects } from "@/api/projects";
import { fetchTasks, changeStatus, approveDraft, discardDraft, updateTask, createTask } from "@/api/tasks";
import { fetchProjectMembers } from "@/api/members";
import { useAuthStore } from "@/store/authStore";
import { useTasksRealtime } from "@/hooks/useTasksRealtime";
import { useToast } from "@/hooks/useToast";
import { useIsMobile } from "@/hooks/useIsMobile";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { MobileListView } from "@/components/mobile/MobileListView";
import { Header } from "@/components/layout/Header";
import { CreateTaskModal } from "@/components/kanban/CreateTaskModal";
import { FilterBar } from "@/components/kanban/FilterBar";
import { DashboardPage } from "@/pages/DashboardPage";
import { ToastContainer } from "@/components/ui/Toast";
import type { Task, TaskStatus } from "@/types/domain";
import type { AppView } from "@/components/layout/Header";

export function KanbanPage() {
  const { user, projectRoles, clearAuth } = useAuthStore();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>("kanban");

  // Filter state
  const [search, setSearch] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Toast
  const { toasts, addToast, removeToast } = useToast();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const activeProjectId = selectedProjectId ?? projects[0]?.id ?? null;
  const tasksQueryKey = ["tasks", activeProjectId, showOnlyMine, user?.id] as const;

  const { data: tasks = [] } = useQuery({
    queryKey: tasksQueryKey,
    queryFn: () => fetchTasks(activeProjectId!, showOnlyMine ? user?.id : undefined),
    enabled: !!activeProjectId,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members", activeProjectId],
    queryFn: () => fetchProjectMembers(activeProjectId!),
    enabled: !!activeProjectId,
  });

  useTasksRealtime(activeProjectId, addToast);

  // Apply client-side filters
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (search.trim()) {
      const lower = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(lower) ||
          (t.description?.toLowerCase().includes(lower) ?? false),
      );
    }
    if (urgencyFilter !== "ALL") {
      result = result.filter((t) => t.urgency === urgencyFilter);
    }
    if (statusFilter !== "ALL") {
      result = result.filter((t) => t.status === statusFilter);
    }
    return result;
  }, [tasks, search, urgencyFilter, statusFilter]);

  const assigneeMutation = useMutation({
    mutationFn: ({ taskId, assigneeId }: { taskId: number; assigneeId: number | null }) =>
      updateTask(taskId, { assignee_id: assigneeId }),
    onMutate: async ({ taskId, assigneeId }) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey });
      const previous = queryClient.getQueryData<Task[]>(tasksQueryKey);
      queryClient.setQueryData<Task[]>(tasksQueryKey, (old = []) =>
        old.map((task) =>
          task.id === taskId ? { ...task, assignee_id: assigneeId, updated_at: new Date().toISOString() } : task,
        ),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksQueryKey, context.previous);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", activeProjectId] }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: TaskStatus }) =>
      changeStatus(taskId, status),
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey });
      const previous = queryClient.getQueryData<Task[]>(tasksQueryKey);
      queryClient.setQueryData<Task[]>(tasksQueryKey, (old = []) =>
        old.map((task) =>
          task.id === taskId ? { ...task, status, updated_at: new Date().toISOString() } : task,
        ),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksQueryKey, context.previous);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", activeProjectId] }),
  });

  const approveMutation = useMutation({
    mutationFn: (taskId: number) => approveDraft(taskId),
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey });
      const previous = queryClient.getQueryData<Task[]>(tasksQueryKey);
      queryClient.setQueryData<Task[]>(tasksQueryKey, (old = []) =>
        old.map((task) =>
          task.id === taskId
            ? { ...task, status: "TODO", updated_at: new Date().toISOString() }
            : task,
        ),
      );
      return { previous };
    },
    onError: (_error, _taskId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksQueryKey, context.previous);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", activeProjectId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: number) => discardDraft(taskId),
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey });
      const previous = queryClient.getQueryData<Task[]>(tasksQueryKey);
      queryClient.setQueryData<Task[]>(tasksQueryKey, (old = []) =>
        old.filter((task) => task.id !== taskId),
      );
      return { previous };
    },
    onError: (_error, _taskId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksQueryKey, context.previous);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", activeProjectId] }),
  });

  const createMutation = useMutation({
    mutationFn: (body: { title: string; description?: string; assignee_id?: number; urgency?: string }) =>
      createTask(activeProjectId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", activeProjectId] });
      setShowCreateModal(false);
    },
  });

  const handleStatusChange = useCallback(
    (taskId: number, newStatus: TaskStatus) => {
      statusMutation.mutate({ taskId, status: newStatus });
    },
    [statusMutation],
  );

  const handleApprove = useCallback(
    (taskId: number) => {
      approveMutation.mutate(taskId);
    },
    [approveMutation],
  );

  const handleDelete = useCallback(
    (taskId: number) => {
      deleteMutation.mutate(taskId);
    },
    [deleteMutation],
  );

  const handleAssigneeChange = useCallback(
    (taskId: number, assigneeId: number | null) => {
      assigneeMutation.mutate({ taskId, assigneeId });
    },
    [assigneeMutation],
  );

  const handleCreateTask = useCallback(
    (body: { title: string; description?: string; assignee_id?: number; urgency?: string }) => {
      createMutation.mutate(body);
    },
    [createMutation],
  );

  if (!user) return null;

  const role = activeProjectId ? projectRoles[activeProjectId] : undefined;
  const isOwner = role === "OWNER";

  return (
    <div className="kanban-page">
      <Header
        user={user}
        projects={projects}
        selectedProjectId={activeProjectId}
        onSelectProject={setSelectedProjectId}
        showOnlyMine={showOnlyMine}
        onToggleMine={() => setShowOnlyMine((v) => !v)}
        onLogout={clearAuth}
        onAddTask={isOwner && activeProjectId ? () => setShowCreateModal(true) : undefined}
        currentView={currentView}
        onViewChange={setCurrentView}
      />
      {activeProjectId ? (
        currentView === "dashboard" ? (
          <DashboardPage projectId={activeProjectId} />
        ) : isMobile ? (
          <MobileListView
            tasks={filteredTasks}
            role={role}
            members={members}
            onApprove={handleApprove}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            onAssigneeChange={handleAssigneeChange}
          />
        ) : (
          <>
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              urgencyFilter={urgencyFilter}
              onUrgencyChange={setUrgencyFilter}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
            />
            <KanbanBoard
              tasks={filteredTasks}
              role={role}
              currentUserId={user.id}
              members={members}
              onStatusChange={handleStatusChange}
              onApprove={handleApprove}
              onDelete={handleDelete}
              onAssigneeChange={handleAssigneeChange}
              showOnlyMine={showOnlyMine}
            />
          </>
        )
      ) : (
        <div className="empty-state">
          <p>No projects available.</p>
        </div>
      )}
      {showCreateModal && activeProjectId && (
        <CreateTaskModal
          members={members}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateTask}
          loading={createMutation.isPending}
        />
      )}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
