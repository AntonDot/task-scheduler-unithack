import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { Task, TaskStatus, ProjectRole } from "@/types/domain";
import { KANBAN_COLUMNS } from "@/types/domain";
import { KanbanColumn } from "./KanbanColumn";
import { TaskDrawer } from "./TaskDrawer";

interface KanbanBoardProps {
  tasks: Task[];
  role: ProjectRole | undefined;
  currentUserId: number | null;
  onStatusChange: (taskId: number, newStatus: TaskStatus) => void;
  onApprove: (taskId: number) => void;
  onDiscard: (taskId: number) => void;
  showOnlyMine: boolean;
}

const VALID_TRANSITIONS: Record<string, Set<string>> = {
  AI_DRAFT: new Set(["TODO"]),
  TODO: new Set(["IN_PROGRESS"]),
  IN_PROGRESS: new Set(["REVIEW", "TODO"]),
  REVIEW: new Set(["DONE", "IN_PROGRESS"]),
  DONE: new Set(["REVIEW", "IN_PROGRESS", "TODO"]),
};

const ASSIGNEE_ALLOWED: Set<string> = new Set(["IN_PROGRESS", "REVIEW", "TODO"]);

export function KanbanBoard({
  tasks,
  role,
  currentUserId,
  onStatusChange,
  onApprove,
  onDiscard,
  showOnlyMine,
}: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const filteredTasks = useMemo(() => {
    if (!showOnlyMine || !currentUserId) return tasks;
    return tasks.filter((t) => t.assignee_id === currentUserId);
  }, [tasks, showOnlyMine, currentUserId]);

  const columns = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const col of KANBAN_COLUMNS) map[col] = [];
    for (const task of filteredTasks) {
      (map[task.status] ??= []).push(task);
    }
    return map;
  }, [filteredTasks]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = Number(String(event.active.id).replace("task-", ""));
      setActiveTask(tasks.find((t) => t.id === id) ?? null);
    },
    [tasks],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!over) return;

      const taskId = Number(String(active.id).replace("task-", ""));
      const newStatus = String(over.id).startsWith("task-") ? null : (over.id as TaskStatus);
      if (!newStatus) return;

      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.status === newStatus) return;

      const allowed = VALID_TRANSITIONS[task.status];
      if (!allowed?.has(newStatus)) return;

      if (role === "ASSIGNEE" && !ASSIGNEE_ALLOWED.has(newStatus)) return;

      if (newStatus === "TODO" && task.status === "AI_DRAFT") {
        onApprove(taskId);
      } else {
        onStatusChange(taskId, newStatus);
      }
    },
    [tasks, role, onStatusChange, onApprove],
  );

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="kanban-board" data-testid="kanban-board">
          {KANBAN_COLUMNS.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={columns[status] ?? []}
              onSelectTask={setSelectedTask}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask && (
            <div className="task-card task-card--drag">
              <div className="task-card__title">{activeTask.title}</div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          role={role}
          onClose={() => setSelectedTask(null)}
          onApprove={(id) => {
            onApprove(id);
            setSelectedTask(null);
          }}
          onDiscard={(id) => {
            onDiscard(id);
            setSelectedTask(null);
          }}
          onStatusChange={(id, status) => {
            onStatusChange(id, status as TaskStatus);
            setSelectedTask(null);
          }}
        />
      )}
    </>
  );
}
