import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "@/types/domain";
import { Avatar } from "./Avatar";
import { getDeadlineStatus, formatRelativeDeadline } from "@/utils/deadline";

interface TaskCardProps {
  task: Task;
  onSelect: (task: Task) => void;
}

export function TaskCard({ task, onSelect }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `task-${task.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const deadlineStatus = getDeadlineStatus(task.deadline);
  const relativeDeadline = formatRelativeDeadline(task.deadline);

  const deadlineClass =
    deadlineStatus === "overdue"
      ? " task-card--overdue"
      : deadlineStatus === "due-soon"
        ? " task-card--due-soon"
        : "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`task-card urgency-${task.urgency.toLowerCase()}${deadlineClass}`}
      onClick={() => onSelect(task)}
      data-testid={`task-card-${task.id}`}
    >
      <div className="task-card__header">
        <span className="task-card__title">{task.title}</span>
      </div>
      <div className="task-card__footer">
        {task.project && (
          <span
            className="task-card__project-tag"
            style={{ borderColor: task.project.color }}
          >
            {task.project.name}
          </span>
        )}
        <span className="task-card__meta">
          {task.deadline && (
            <span
              className={`task-card__deadline${deadlineStatus === "overdue" ? " task-card__deadline--overdue" : deadlineStatus === "due-soon" ? " task-card__deadline--due-soon" : ""}`}
            >
              {relativeDeadline}
            </span>
          )}
          {task.assignee && <Avatar name={task.assignee.full_name} size={24} />}
        </span>
      </div>
    </div>
  );
}
