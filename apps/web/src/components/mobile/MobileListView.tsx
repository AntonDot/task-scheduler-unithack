import { useMemo, useState } from "react";
import type { Task, ProjectRole, BoardColumn } from "@/types/domain";
import { MobileTaskCard } from "./MobileTaskCard";
import { MobileActionSheet } from "./MobileActionSheet";
import type { ProjectMember } from "@/api/members";

interface MobileListViewProps {
  tasks: Task[];
  columns: BoardColumn[];
  role: ProjectRole | undefined;
  members: ProjectMember[];
  onApprove: (taskId: number) => void;
  onDelete: (taskId: number) => void;
  onColumnChange?: (taskId: number, columnId: number) => void;
  onAssigneeChange: (taskId: number, assigneeId: number | null) => void;
}

export function MobileListView({
  tasks,
  columns,
  role,
  members,
  onApprove,
  onDelete,
  onAssigneeChange,
}: MobileListViewProps) {
  const [activeColId, setActiveColId] = useState<number | null>(columns[0]?.id ?? null);
  const [actionSheetTask, setActionSheetTask] = useState<Task | null>(null);

  const colTasks = useMemo(() => {
    if (activeColId === null) return tasks;
    return tasks.filter(t => t.column_id === activeColId);
  }, [tasks, activeColId]);

  return (
    <div className="mobile-list" data-testid="mobile-list-view">
      <div className="mobile-tabs">
        {columns.map((col) => (
          <button
            key={col.id}
            className={`mobile-tab ${activeColId === col.id ? "active" : ""}`}
            onClick={() => setActiveColId(col.id)}
          >
            {col.name}
            <span className="mobile-tab__count">
              {tasks.filter(t => t.column_id === col.id).length}
            </span>
          </button>
        ))}
      </div>
      <div className="mobile-cards">
        {colTasks.length === 0 ? (
          <p className="text-muted mobile-empty">Нет задач</p>
        ) : (
          colTasks.map((task) => (
            <MobileTaskCard
              key={task.id}
              task={task}
              role={role}
              onApprove={onApprove}
              onDelete={onDelete}
              onLongPress={() => setActionSheetTask(task)}
            />
          ))
        )}
      </div>
      {actionSheetTask && (
        <MobileActionSheet
          task={actionSheetTask}
          role={role}
          members={members}
          onClose={() => setActionSheetTask(null)}
          onApprove={onApprove}
          onDelete={onDelete}
          onAssigneeChange={onAssigneeChange}
        />
      )}
    </div>
  );
}
