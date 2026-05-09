import { useState } from "react";
import type { ProjectMember } from "@/api/members";

interface CreateTaskModalProps {
  members: ProjectMember[];
  onClose: () => void;
  onCreate: (body: { title: string; description?: string; assignee_id?: number; urgency?: string; deadline?: string }) => void;
  loading: boolean;
}

export function CreateTaskModal({ members, onClose, onCreate, loading }: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [urgency, setUrgency] = useState("MEDIUM");
  const [deadline, setDeadline] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      assignee_id: assigneeId ? Number(assigneeId) : undefined,
      urgency,
      deadline: deadline || undefined,
    });
  };

  return (
    <div className="create-task-overlay" onClick={onClose}>
      <div className="create-task-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Новая задача</h2>
        <form className="create-task-form" onSubmit={handleSubmit}>
          <div className="create-task-field">
            <label htmlFor="ct-title">Название *</label>
            <input
              id="ct-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название задачи"
              maxLength={500}
              required
              autoFocus
              disabled={loading}
            />
          </div>
          <div className="create-task-field">
            <label htmlFor="ct-desc">Описание</label>
            <textarea
              id="ct-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Подробное описание..."
              rows={3}
              disabled={loading}
            />
          </div>
          <div className="create-task-field">
            <label htmlFor="ct-assignee">Исполнитель</label>
            <select
              id="ct-assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={loading}
            >
              <option value="">Не назначен</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.role})
                </option>
              ))}
            </select>
          </div>
          <div className="create-task-field">
            <label htmlFor="ct-urgency">Срочность</label>
            <select
              id="ct-urgency"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              disabled={loading}
            >
              <option value="LOW">Низкая</option>
              <option value="MEDIUM">Средняя</option>
              <option value="HIGH">Высокая</option>
              <option value="URGENT">Критичная</option>
            </select>
          </div>
          <div className="create-task-field">
            <label htmlFor="ct-deadline">Дедлайн</label>
            <input
              id="ct-deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="create-task-actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={loading}>
              Отмена
            </button>
            <button type="submit" className="btn btn--primary" disabled={loading || !title.trim()}>
              {loading ? "Создание..." : "Создать задачу"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
