import { useState, useEffect, useRef } from "react";
import type { Task, ProjectRole } from "@/types/domain";
import { TaskStatus } from "@/types/domain";
import { Avatar } from "./Avatar";
import { fetchComments, addComment } from "@/api/comments";
import type { Comment } from "@/api/comments";
import { fetchAttachments, uploadAttachment, deleteAttachment, getDownloadUrl } from "@/api/attachments";
import type { Attachment } from "@/api/attachments";
import type { ProjectMember } from "@/api/members";

interface TaskDrawerProps {
  task: Task;
  role: ProjectRole | undefined;
  members: ProjectMember[];
  onClose: () => void;
  onApprove: (taskId: number) => void;
  onDelete: (taskId: number) => void;
  onStatusChange: (taskId: number, status: string) => void;
  onAssigneeChange: (taskId: number, assigneeId: number | null) => void;
}

export function TaskDrawer({
  task,
  role,
  members,
  onClose,
  onApprove,
  onDelete,
  onStatusChange,
  onAssigneeChange,
}: TaskDrawerProps) {
  const isOwner = role === "OWNER";
  const canApprove = isOwner && task.status === TaskStatus.AI_DRAFT;

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Attachments state
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCommentsLoading(true);
    fetchComments(task.id)
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setCommentsLoading(false));

    setAttachmentsLoading(true);
    fetchAttachments(task.id)
      .then(setAttachments)
      .catch(() => setAttachments([]))
      .finally(() => setAttachmentsLoading(false));
  }, [task.id]);

  const handleAddComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed || commentLoading) return;
    setCommentLoading(true);
    try {
      const created = await addComment(task.id, trimmed);
      setComments((prev) => [...prev, created]);
      setCommentText("");
    } catch {
      // silently fail
    } finally {
      setCommentLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddComment();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploadingFile) return;
    setUploadError(null);
    setUploadingFile(true);
    try {
      const attachment = await uploadAttachment(task.id, file);
      setAttachments((prev) => [...prev, attachment]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    try {
      await deleteAttachment(attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch {
      // silently fail
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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

        {/* Assignee */}
        <div className="drawer__assignee">
          {isOwner ? (
            <>
              <h4>Assignee</h4>
              <select
                className="drawer__assignee-select"
                value={task.assignee_id ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  onAssigneeChange(task.id, val ? Number(val) : null);
                }}
                data-testid="assignee-select"
              >
                <option value="">Not assigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.role})
                  </option>
                ))}
              </select>
            </>
          ) : task.assignee ? (
            <>
              <Avatar name={task.assignee.full_name} size={32} />
              <span>{task.assignee.full_name}</span>
            </>
          ) : (
            <span className="text-muted">Not assigned</span>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <div className="drawer__description">
            <h4>Description</h4>
            <p>{task.description}</p>
          </div>
        )}

        {/* Deadline */}
        {task.deadline && (
          <div className="drawer__deadline">
            <h4>Deadline</h4>
            <p>{new Date(task.deadline).toLocaleDateString("ru-RU")}</p>
          </div>
        )}

        {/* Actions */}
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
                onClick={() => onDelete(task.id)}
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
          {isOwner && task.status !== TaskStatus.AI_DRAFT && (
            <>
              {!showDeleteConfirm ? (
                <button
                  className="btn btn--danger"
                  onClick={() => setShowDeleteConfirm(true)}
                  data-testid="delete-btn"
                >
                  Delete Task
                </button>
              ) : (
                <div className="drawer__delete-confirm">
                  <span>Delete this task?</span>
                  <button
                    className="btn btn--danger"
                    onClick={() => onDelete(task.id)}
                    data-testid="delete-confirm-btn"
                  >
                    Yes, delete
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Attachments */}
        <div className="drawer__attachments">
          <h4>Attachments</h4>
          {attachmentsLoading ? (
            <p className="text-muted">Loading...</p>
          ) : attachments.length === 0 ? (
            <p className="text-muted">No attachments</p>
          ) : (
            <div className="drawer__attachments-list" data-testid="attachments-list">
              {attachments.map((att) => (
                <div key={att.id} className="drawer__attachment" data-testid="attachment-item">
                  <a
                    href={getDownloadUrl(att.id)}
                    className="drawer__attachment-name"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`attachment-link-${att.id}`}
                  >
                    📎 {att.filename}
                  </a>
                  <span className="drawer__attachment-size">{formatFileSize(att.size_bytes)}</span>
                  {isOwner && (
                    <button
                      className="drawer__attachment-delete"
                      onClick={() => handleDeleteAttachment(att.id)}
                      data-testid={`attachment-delete-${att.id}`}
                      title="Delete"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="drawer__attachment-upload">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              disabled={uploadingFile}
              className="drawer__attachment-input"
              data-testid="attachment-file-input"
            />
            {uploadingFile && <span className="text-muted">Uploading...</span>}
            {uploadError && <span className="drawer__attachment-error">{uploadError}</span>}
          </div>
        </div>

        {/* Comments / Activity Log */}
        <div className="drawer__comments">
          <h4>Activity</h4>
          {commentsLoading ? (
            <p className="text-muted">Loading...</p>
          ) : comments.length === 0 ? (
            <p className="text-muted">No activity yet</p>
          ) : (
            <div className="drawer__comments-list">
              {comments.map((c) => (
                <div key={c.id} className="drawer__comment" data-testid="comment-item">
                  <div className="drawer__comment-header">
                    <span className="drawer__comment-author">
                      {c.user?.full_name ?? "User"}
                    </span>
                    <span className="drawer__comment-time">
                      {new Date(c.created_at).toLocaleString("ru-RU")}
                    </span>
                  </div>
                  <p className="drawer__comment-text">{c.text}</p>
                </div>
              ))}
            </div>
          )}
          <div className="drawer__comment-form">
            <textarea
              className="drawer__comment-input"
              placeholder="Add a comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              maxLength={2000}
              data-testid="comment-input"
            />
            <button
              className="btn btn--primary drawer__comment-submit"
              onClick={handleAddComment}
              disabled={!commentText.trim() || commentLoading}
              data-testid="comment-submit"
            >
              {commentLoading ? "..." : "Send"}
            </button>
          </div>
        </div>

        {/* History */}
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
