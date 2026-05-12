import type { Task, ProjectRole } from "@/types/domain";
import { TaskStatus } from "@/types/domain";
import type { ProjectMember } from "@/api/members";

interface ActionItem {
  label: string;
  action: () => void;
  variant?: "primary" | "danger" | "default";
}

interface MobileActionSheetProps {
  task: Task;
  role: ProjectRole | undefined;
  members: ProjectMember[];
  onClose: () => void;
  onApprove: (taskId: number) => void;
  onDelete: (taskId: number) => void;
  onStatusChange: (taskId: number, status: TaskStatus) => void;
  onAssigneeChange: (taskId: number, assigneeId: number | null) => void;
}

export function MobileActionSheet({
  task,
  role,
  members,
  onClose,
  onApprove,
  onDelete,
  onStatusChange,
  onAssigneeChange,
}: MobileActionSheetProps) {
  const isOwner = role === "OWNER";
  const isDraft = task.status === TaskStatus.AI_DRAFT;

  const actions: ActionItem[] = [];

  if (isDraft && isOwner) {
    actions.push({
      label: "Взять в работу",
      action: () => { onApprove(task.id); onClose(); },
      variant: "primary",
    });
    actions.push({
      label: "Отклонить",
      action: () => { onDelete(task.id); onClose(); },
      variant: "danger",
    });
  }

  if (task.status === TaskStatus.TODO) {
    actions.push({
      label: "Начать работу",
      action: () => { onStatusChange(task.id, TaskStatus.IN_PROGRESS); onClose(); },
      variant: "primary",
    });
  }

  if (task.status === TaskStatus.IN_PROGRESS) {
    actions.push({
      label: "На проверку",
      action: () => { onStatusChange(task.id, TaskStatus.REVIEW); onClose(); },
      variant: "primary",
    });
  }

  if (task.status === TaskStatus.REVIEW) {
    actions.push({
      label: "Завершить",
      action: () => { onStatusChange(task.id, TaskStatus.DONE); onClose(); },
      variant: "primary",
    });
  }

  if (isOwner && !isDraft) {
    actions.push({
      label: "Удалить задачу",
      action: () => { onDelete(task.id); onClose(); },
      variant: "danger",
    });
  }

  return (
    <div className="action-sheet-overlay" onClick={onClose} data-testid="action-sheet">
      <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="action-sheet__header">
          <h3 className="action-sheet__title">{task.title}</h3>
          <span className={`status-badge status-${task.status.toLowerCase()}`}>{task.status}</span>
        </div>

        {/* Assignee selector for owners */}
        {isOwner && (
          <div className="action-sheet__assignee">
            <label className="action-sheet__label">Исполнитель</label>
            <select
              className="action-sheet__select"
              value={task.assignee_id ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                onAssigneeChange(task.id, val ? Number(val) : null);
              }}
              data-testid="action-sheet-assignee"
            >
              <option value="">Не назначен</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        <div className="action-sheet__actions">
          {actions.map((item, i) => (
            <button
              key={i}
              className={`action-sheet__btn action-sheet__btn--${item.variant ?? "default"}`}
              onClick={item.action}
              data-testid={`action-sheet-btn-${i}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <button className="action-sheet__cancel" onClick={onClose} data-testid="action-sheet-cancel">
          Отмена
        </button>
      </div>
    </div>
  );
}
