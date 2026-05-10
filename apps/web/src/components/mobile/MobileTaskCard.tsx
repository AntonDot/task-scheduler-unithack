import { useRef, useCallback } from "react";
import type { Task, ProjectRole } from "@/types/domain";
import { TaskStatus } from "@/types/domain";
import { Avatar } from "../kanban/Avatar";
import { getDeadlineStatus, formatRelativeDeadline } from "@/utils/deadline";

interface MobileTaskCardProps {
  task: Task;
  role: ProjectRole | undefined;
  onApprove: (taskId: number) => void;
  onDelete: (taskId: number) => void;
  onStatusChange: (taskId: number, status: TaskStatus) => void;
  onLongPress?: () => void;
}

const URGENCY_LABELS: Record<string, string> = {
  URGENT: "Срочно",
  HIGH: "Высокий",
  MEDIUM: "Средний",
  LOW: "Низкий",
};

const LONG_PRESS_DURATION = 500;

export function MobileTaskCard({
  task,
  role,
  onApprove,
  onDelete,
  onStatusChange,
  onLongPress,
}: MobileTaskCardProps) {
  const isOwner = role === "OWNER";
  const isDraft = task.status === TaskStatus.AI_DRAFT;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const deadlineStatus = getDeadlineStatus(task.deadline);
  const relativeDeadline = formatRelativeDeadline(task.deadline);

  const deadlineClass =
    deadlineStatus === "overdue"
      ? " mobile-card--overdue"
      : deadlineStatus === "due-soon"
        ? " mobile-card--due-soon"
        : "";

  const handleTouchStart = useCallback(() => {
    longPressTriggered.current = false;
    timerRef.current = setTimeout(() => {
      longPressTriggered.current = true;
      onLongPress?.();
    }, LONG_PRESS_DURATION);
  }, [onLongPress]);

  const handleTouchEnd = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return (
    <div
      className={`mobile-card urgency-${task.urgency.toLowerCase()}${deadlineClass}`}
      data-testid={`mobile-card-${task.id}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress?.();
      }}
    >
      <div className="mobile-card__top">
        <span className={`urgency-badge urgency-${task.urgency.toLowerCase()}`}>
          {URGENCY_LABELS[task.urgency] ?? task.urgency}
        </span>
        {task.deadline && (
          <span
            className={`mobile-card__deadline${deadlineStatus === "overdue" ? " mobile-card__deadline--overdue" : deadlineStatus === "due-soon" ? " mobile-card__deadline--due-soon" : ""}`}
          >
            {relativeDeadline}
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
        {task.assignee && <Avatar user={{ full_name: task.assignee.full_name, id: task.assignee.id }} size={24} />}
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
              onClick={() => onDelete(task.id)}
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
