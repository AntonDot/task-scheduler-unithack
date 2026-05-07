import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Task, TaskStatus } from "@/types/domain";
import { COLUMN_LABELS } from "@/types/domain";
import { TaskCard } from "./TaskCard";

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onSelectTask: (task: Task) => void;
}

export function KanbanColumn({ status, tasks, onSelectTask }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const ids = tasks.map((t) => `task-${t.id}`);

  return (
    <div
      ref={setNodeRef}
      className={`kanban-column ${isOver ? "kanban-column--over" : ""}`}
      data-testid={`column-${status}`}
    >
      <div className="kanban-column__header">
        <h3>{COLUMN_LABELS[status]}</h3>
        <span className="kanban-column__count">{tasks.length}</span>
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="kanban-column__cards">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onSelect={onSelectTask} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
