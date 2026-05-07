import type { Task, ProjectRole } from "@/types/domain";
import { TaskStatus } from "@/types/domain";
import { Avatar } from "./Avatar";

interface TaskDrawerProps {
  task: Task;
  role: ProjectRole | undefined;
  onClose: () => void;
  onApprove: (taskId: number) => void;
  onDiscard: (taskId: number) => void;
  onStatusChange: (taskId: number, status: string) => void;
}

export function TaskDrawer({ task, role, onClose, onApprove, onDiscard, onStatusChange }: TaskDrawerProps) {
  const isOwner = role === "OWNER";
  const canApprove = isOwner && task.status === TaskStatus.AI_DRAFT;

  return (
    <div className="drawer-overlay" onClick={onClose} data-testid="task-drawer">
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="drawer__close" onClick={onClose}>
          &times;
        </button>
        <h2 className="drawer__title">{task.title}</h2>
        <div className="drawer__meta">
          <span className={`status-badge status-${task.status.toLowerCase()}`}>
            {task.status}
          </span>
          <span className={`urgency-badge urgency-${task.urgency.toLowerCase()}`}>
            {task.urgency}
          </span>
        </div>
        {task.assignee && (
          <div className="drawer__assignee">
            <Avatar name={task.assignee.full_name} size={32} />
            <span>{task.assignee.full_name}</span>
          </div>
        )}
        {task.description && (
          <div className="drawer__description">
            <h4>Description</h4>
            <p>{task.description}</p>
          </div>
        )}
        {task.deadline && (
          <div className="drawer__deadline">
            <h4>Deadline</h4>
            <p>{new Date(task.deadline).toLocaleDateString("ru-RU")}</p>
          </div>
        )}
        <div className="drawer__actions">
          {canApprove && (
            <>
              <button
                className="btn btn--primary"
                onClick={() => onApprove(task.id)}
                data-testid="approve-btn"
              >
                Approve Draft
              </button>
              <button
                className="btn btn--danger"
                onClick={() => onDiscard(task.id)}
                data-testid="discard-btn"
              >
                Discard
              </button>
            </>
          )}
          {task.status === TaskStatus.TODO && (
            <button
              className="btn btn--secondary"
              onClick={() => onStatusChange(task.id, TaskStatus.IN_PROGRESS)}
            >
              Start Work
            </button>
          )}
          {task.status === TaskStatus.IN_PROGRESS && (
            <button
              className="btn btn--secondary"
              onClick={() => onStatusChange(task.id, TaskStatus.REVIEW)}
            >
              Send to Review
            </button>
          )}
          {task.status === TaskStatus.REVIEW && isOwner && (
            <button
              className="btn btn--primary"
              onClick={() => onStatusChange(task.id, TaskStatus.DONE)}
            >
              Complete
            </button>
          )}
        </div>
        <div className="drawer__history">
          <h4>History</h4>
          <p className="text-muted">
            Created: {new Date(task.created_at).toLocaleString("ru-RU")}
          </p>
          <p className="text-muted">
            Updated: {new Date(task.updated_at).toLocaleString("ru-RU")}
          </p>
        </div>
      </div>
    </div>
  );
}
