import { useState } from "react";
import type { ProjectMember } from "@/api/members";

interface CreateTaskModalProps {
  members: ProjectMember[];
  onClose: () => void;
  onCreate: (body: { title: string; description?: string; assignee_id?: number; urgency?: string }) => void;
  loading: boolean;
}

export function CreateTaskModal({ members, onClose, onCreate, loading }: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [urgency, setUrgency] = useState("MEDIUM");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      assignee_id: assigneeId ? Number(assigneeId) : undefined,
      urgency,
    });
  };

  return (
    <div className="create-task-overlay" onClick={onClose}>
      <div className="create-task-modal" onClick={(e) => e.stopPropagation()}>
        <h2>New Task</h2>
        <form className="create-task-form" onSubmit={handleSubmit}>
          <div className="create-task-field">
            <label htmlFor="ct-title">Title *</label>
            <input
              id="ct-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              maxLength={500}
              required
              autoFocus
              disabled={loading}
            />
          </div>
          <div className="create-task-field">
            <label htmlFor="ct-desc">Description</label>
            <textarea
              id="ct-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              disabled={loading}
            />
          </div>
          <div className="create-task-field">
            <label htmlFor="ct-assignee">Assignee</label>
            <select
              id="ct-assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={loading}
            >
              <option value="">Not assigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.role})
                </option>
              ))}
            </select>
          </div>
          <div className="create-task-field">
            <label htmlFor="ct-urgency">Urgency</label>
            <select
              id="ct-urgency"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              disabled={loading}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
          <div className="create-task-actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={loading || !title.trim()}>
              {loading ? "Creating..." : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
