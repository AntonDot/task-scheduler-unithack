import type { Task, ProjectRole } from "@/types/domain";
import { TaskStatus } from "@/types/domain";
import { Avatar } from "../kanban/Avatar";

interface MobileTaskCardProps {
  task: Task;
  role: ProjectRole | undefined;
  onApprove: (taskId: number) => void;
  onDiscard: (taskId: number) => void;
  onStatusChange: (taskId: number, status: TaskStatus) => void;
}

const URGENCY_LABELS: Record<string, string> = {
  URGENT: "Срочно",
  HIGH: "Высокий",
  MEDIUM: "Средний",
  LOW: "Низкий",
};

export function MobileTaskCard({ task, role, onApprove, onDiscard, onStatusChange }: MobileTaskCardProps) {
  const isOwner = role === "OWNER";
  const isDraft = task.status === TaskStatus.AI_DRAFT;

  return (
    <div
      className={`mobile-card urgency-${task.urgency.toLowerCase()}`}
      data-testid={`mobile-card-${task.id}`}
    >
      <div className="mobile-card__top">
        <span className={`urgency-badge urgency-${task.urgency.toLowerCase()}`}>
          {URGENCY_LABELS[task.urgency] ?? task.urgency}
        </span>
        {task.deadline && (
          <span className="mobile-card__deadline">
            {new Date(task.deadline).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
      <h3 className="mobile-card__title">{task.title}</h3>
      <div className="mobile-card__meta">
        {task.project && (
          <span className="mobile-card__project" style={{ borderColor: task.project.color }}>
            {task.project.name}
          </span>
        )}
        {task.assignee && <Avatar name={task.assignee.full_name} size={24} />}
      </div>
      <div className="mobile-card__actions">
        {isDraft && isOwner && (
          <>
            <button
              className="btn btn--primary mobile-action-btn"
              onClick={() => onApprove(task.id)}
              data-testid={`mobile-approve-${task.id}`}
            >
              Взять в работу
            </button>
            <button
              className="btn btn--danger mobile-action-btn"
              onClick={() => onDiscard(task.id)}
              data-testid={`mobile-discard-${task.id}`}
            >
              Отклонить
            </button>
          </>
        )}
        {task.status === TaskStatus.TODO && (
          <button
            className="btn btn--primary mobile-action-btn"
            onClick={() => onStatusChange(task.id, TaskStatus.IN_PROGRESS)}
            data-testid={`mobile-start-${task.id}`}
          >
            Начать
          </button>
        )}
        {task.status === TaskStatus.IN_PROGRESS && (
          <button
            className="btn btn--secondary mobile-action-btn"
            onClick={() => onStatusChange(task.id, TaskStatus.REVIEW)}
          >
            На проверку
          </button>
        )}
        {task.status === TaskStatus.REVIEW && isOwner && (
          <button
            className="btn btn--primary mobile-action-btn"
            onClick={() => onStatusChange(task.id, TaskStatus.DONE)}
          >
            Завершить
          </button>
        )}
      </div>
    </div>
  );
}
