import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchProjects } from "@/api/projects";
import { fetchTasks, changeStatus, approveDraft, discardDraft, updateTask } from "@/api/tasks";
import { fetchProjectMembers } from "@/api/members";
import { useAuthStore } from "@/store/authStore";
import { useTasksRealtime } from "@/hooks/useTasksRealtime";
import { useIsMobile } from "@/hooks/useIsMobile";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { MobileListView } from "@/components/mobile/MobileListView";
import { Header } from "@/components/layout/Header";
import type { Task, TaskStatus } from "@/types/domain";

export function KanbanPage() {
  const { user, projectRoles, clearAuth } = useAuthStore();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [showOnlyMine, setShowOnlyMine] = useState(false);

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

  useTasksRealtime(activeProjectId);

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

  const discardMutation = useMutation({
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

  const handleDiscard = useCallback(
    (taskId: number) => {
      discardMutation.mutate(taskId);
    },
    [discardMutation],
  );

  const handleAssigneeChange = useCallback(
    (taskId: number, assigneeId: number | null) => {
      assigneeMutation.mutate({ taskId, assigneeId });
    },
    [assigneeMutation],
  );

  if (!user) return null;

  const role = activeProjectId ? projectRoles[activeProjectId] : undefined;

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
      />
      {activeProjectId ? (
        isMobile ? (
          <MobileListView
            tasks={tasks}
            role={role}
            onApprove={handleApprove}
            onDiscard={handleDiscard}
            onStatusChange={handleStatusChange}
          />
        ) : (
          <KanbanBoard
            tasks={tasks}
            role={role}
            currentUserId={user.id}
            members={members}
            onStatusChange={handleStatusChange}
            onApprove={handleApprove}
            onDiscard={handleDiscard}
            onAssigneeChange={handleAssigneeChange}
            showOnlyMine={showOnlyMine}
          />
        )
      ) : (
        <div className="empty-state">
          <p>No projects available.</p>
        </div>
      )}
    </div>
  );
}
