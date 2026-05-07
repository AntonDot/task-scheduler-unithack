import { useMemo, useState } from "react";
import type { Task, ProjectRole, TaskStatus } from "@/types/domain";
import { KANBAN_COLUMNS, COLUMN_LABELS } from "@/types/domain";
import { MobileTaskCard } from "./MobileTaskCard";

interface MobileListViewProps {
  tasks: Task[];
  role: ProjectRole | undefined;
  onApprove: (taskId: number) => void;
  onDiscard: (taskId: number) => void;
  onStatusChange: (taskId: number, status: TaskStatus) => void;
}

export function MobileListView({ tasks, role, onApprove, onDiscard, onStatusChange }: MobileListViewProps) {
  const [activeTab, setActiveTab] = useState<TaskStatus>(KANBAN_COLUMNS[0]!);

  const grouped = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const col of KANBAN_COLUMNS) map[col] = [];
    for (const task of tasks) (map[task.status] ??= []).push(task);
    return map;
  }, [tasks]);

  const activeTasks = grouped[activeTab] ?? [];

  return (
    <div className="mobile-list" data-testid="mobile-list-view">
      <div className="mobile-tabs">
        {KANBAN_COLUMNS.map((status) => (
          <button
            key={status}
            className={`mobile-tab ${activeTab === status ? "active" : ""}`}
            onClick={() => setActiveTab(status)}
          >
            {COLUMN_LABELS[status]}
            <span className="mobile-tab__count">{grouped[status]?.length ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="mobile-cards">
        {activeTasks.length === 0 ? (
          <p className="text-muted mobile-empty">Нет задач</p>
        ) : (
          activeTasks.map((task) => (
              <MobileTaskCard
                key={task.id}
                task={task}
                role={role}
                onApprove={onApprove}
                onDiscard={onDiscard}
                onStatusChange={onStatusChange}
              />
          ))
        )}
      </div>
    </div>
  );
}
