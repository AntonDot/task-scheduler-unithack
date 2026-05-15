import { useState, useEffect, useRef } from 'react';
import type { Task } from '@/types/domain';
import type { Theme } from '@/theme/theme';
import { getUrgencyMap, apiUrgencyToDesign } from '@/theme/theme';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { DatePicker } from '@/components/ui/DatePicker';
import { Avatar } from './Avatar';
import { IcoX } from '@/components/ui/Icons';
import type { ProjectMember } from '@/api/members';
import { fetchTask, updateTask, changeColumn } from '@/api/tasks';
import { fetchComments, addComment } from '@/api/comments';
import { fetchAuditLogs } from '@/api/audit';
import type { Comment } from '@/api/comments';
import type { AuditLog } from '@/api/audit';
import type { BoardColumn } from '@/types/domain';
import { useAuthStore } from '@/store/authStore';
import { fetchAttachments, uploadAttachment, deleteAttachment, getDownloadUrl, type Attachment } from '@/api/attachments';

interface TaskDrawerProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (updated: Task) => void;
  members: ProjectMember[];
  columns: BoardColumn[];
  accentColor: string;
  theme: Theme;
  scrollToSection?: 'comments' | 'description';
}

export function TaskDrawer({ task, open, onClose, onUpdate, members, columns, accentColor, theme, scrollToSection }: TaskDrawerProps) {
  const [localTask, setLocalTask] = useState<Task | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTaskIdRef = useRef<number | null>(null);
  const currentTaskIdRef = useRef<number | null>(null);
  const acc = accentColor;
  const th  = theme;
  const { user, projectRoles } = useAuthStore();

  // Scroll refs for notification deep-linking
  const descriptionRef   = useRef<HTMLDivElement>(null);
  const commentsRef      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !scrollToSection) return;
    const t = setTimeout(() => {
      const target = scrollToSection === 'comments' ? commentsRef.current : descriptionRef.current;
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
    return () => clearTimeout(t);
  }, [open, scrollToSection]);

  // Activity state
  const [comments,  setComments]  = useState<Comment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const activityEndRef = useRef<HTMLDivElement>(null);

  // Attachment state
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileDragOver, setFileDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx]     = useState(0);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Cancel any in-flight description save for the previous task
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    currentTaskIdRef.current = task?.id ?? null;
    if (task) setLocalTask(task);
  }, [task?.id]);

  useEffect(() => {
    if (!task || !open) return;
    const id = task.id;
    openTaskIdRef.current = id;
    fetchTask(id).then(t   => { if (openTaskIdRef.current === id) setLocalTask(t); }).catch(() => {});
    fetchComments(id).then(cs => { if (openTaskIdRef.current === id) setComments(cs); }).catch(() => {});
    fetchAuditLogs(id).then(ls => { if (openTaskIdRef.current === id) setAuditLogs(ls); }).catch(() => {});
    fetchAttachments(id).then(as => { if (openTaskIdRef.current === id) setAttachments(as); }).catch(() => {});
  }, [task?.id, open]);

  if (!task) return null;
  const display = localTask || task;

  const urgKey  = apiUrgencyToDesign(display.urgency);
  const col     = display.column_id;
  const urgMap  = getUrgencyMap(th.dark);

  const role = display.project_id ? projectRoles[display.project_id] : undefined;
  const isLead = role === 'OWNER';
  const isAssignee = display.assignee_id === user?.id || display.co_assignees?.some(c => c.id === user?.id);
  const canEdit = isLead || isAssignee;
  const readonly = !canEdit;

  function patch(changes: Partial<Task>) {
    if (readonly) return;
    const updated = { ...display, ...changes } as Task;
    setLocalTask(updated);
    onUpdate(updated);
  }

  function handleColumnChange(columnId: number) {
    if (readonly) return;
    changeColumn(display.id, columnId).then(updated => {
      setLocalTask(updated);
      onUpdate(updated);
    });
  }

  function handleDescriptionChange(text: string) {
    if (readonly) return;
    const taskId = display.id;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (currentTaskIdRef.current !== taskId) return;
      updateTask(taskId, { description: text }).then(updated => {
        if (currentTaskIdRef.current !== taskId) return;
        setLocalTask(updated);
        onUpdate(updated);
      });
    }, 1000);
    setLocalTask(prev => prev ? { ...prev, description: text } : prev);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement> | File) {
    const isEvent = 'target' in e;
    const file = isEvent ? (e as React.ChangeEvent<HTMLInputElement>).target.files?.[0] : (e as File);
    if (!file || !display) return;
    if (isEvent) (e as React.ChangeEvent<HTMLInputElement>).target.value = '';
    setUploadingFile(true);
    try {
      const att = await uploadAttachment(display.id, file);
      setAttachments(prev => [...prev, att]);
    } catch {}
    finally { setUploadingFile(false); }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setFileDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileUpload(droppedFile);
    }
  }

  function handleFileDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setFileDragOver(true);
  }

  function handleFileDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setFileDragOver(false);
  }

  async function handleDeleteAttachment(attId: number) {
    await deleteAttachment(attId).catch(() => {});
    setAttachments(prev => prev.filter(a => a.id !== attId));
  }

  function handleAiResult(result: { title: string; description: string; urgency: string }) {
    if (readonly) return;
    const updates: { description?: string; urgency?: string } = {};
    if (result.description) updates.description = result.description;
    if (result.urgency) updates.urgency = result.urgency;
    if (Object.keys(updates).length === 0) return;
    updateTask(display.id, updates).then(updated => {
      setLocalTask(updated);
      onUpdate(updated);
    });
  }

  function handleDeadlineChange(val: string) {
    if (readonly) return;
    const deadline = val || null;
    updateTask(display.id, { deadline }).then(updated => {
      setLocalTask(updated);
      onUpdate(updated);
    });
  }

  function handleAssigneeClick(memberId: number) {
    if (readonly) return;
    const primaryId   = display.assignee_id;
    const coIds       = (display.co_assignees ?? []).map(u => u.id);
    const isPrimary   = primaryId === memberId;
    const isCo        = coIds.includes(memberId);
    const isSelected  = isPrimary || isCo;

    let newPrimaryId: number | null = primaryId;
    let newCoIds: number[] = coIds;

    if (isSelected) {
      // Remove
      if (isPrimary) {
        // Promote first co-assignee to primary
        newPrimaryId = newCoIds[0] ?? null;
        newCoIds = newCoIds.slice(1);
      } else {
        newCoIds = newCoIds.filter(id => id !== memberId);
      }
    } else {
      // Add: if no primary, make primary; else add as co
      if (!newPrimaryId) {
        newPrimaryId = memberId;
      } else {
        newCoIds = [...newCoIds, memberId];
      }
    }

    updateTask(display.id, { assignee_id: newPrimaryId, co_assignee_ids: newCoIds }).then(updated => {
      setLocalTask(updated);
      onUpdate(updated);
    });
  }

  async function handleSendComment() {
    if (!commentText.trim()) return;
    setSendingComment(true);
    try {
      const c = await addComment(display.id, commentText.trim());
      setComments(prev => [...prev, c]);
      setCommentText('');
      setTimeout(() => activityEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } finally {
      setSendingComment(false);
    }
  }

  // Merge comments + audit into a single timeline sorted by date
  type ActivityItem =
    | { kind: 'comment'; ts: number; data: Comment }
    | { kind: 'log'; ts: number; data: AuditLog };

  const timeline: ActivityItem[] = [
    ...comments.map(c => ({ kind: 'comment' as const, ts: new Date(c.created_at).getTime(), data: c })),
    ...auditLogs
      .filter(l => l.action !== 'comment_added')
      .map(l => ({ kind: 'log' as const, ts: new Date(l.created_at).getTime(), data: l })),
  ].sort((a, b) => a.ts - b.ts);

  function fmtTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function actionLabel(action: string) {
    const map: Record<string, string> = {
      created: 'создал задачу',
      updated: 'обновил задачу',
      status_changed: 'изменил статус',
      deleted: 'удалил задачу',
      attachment_added: 'прикрепил файл',
      attachment_removed: 'удалил файл',
    };
    return map[action] ?? action;
  }

  const projectBg    = display.project?.color ? display.project.color + '20' : '#EEF2FF';
  const projectColor = display.project?.color || '#4338CA';

  const metaLabelStyle: React.CSSProperties = {
    width: 76, fontSize: 12, color: th.textMuted, fontWeight: 500, flexShrink: 0,
  };
  const metaRowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
  };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.18)',
        zIndex: 40, opacity: open ? 1 : 0,
        transition: 'opacity 0.2s',
        pointerEvents: open ? 'auto' : 'none',
      }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 520, background: th.surface,
        boxShadow: '-6px 0 40px rgba(0,0,0,0.12)',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        {/* Sticky header */}
        <div style={{
          padding: '18px 24px 16px', borderBottom: `1px solid ${th.border}`,
          background: th.surface, zIndex: 1, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, paddingRight: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, color: th.textMuted }}>#{display.id}</span>
              </div>
              <h2 style={{ fontSize: 19, fontWeight: 700, color: th.text, lineHeight: 1.3, margin: 0 }}>
                {display.title}
              </h2>
            </div>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: th.textMuted, padding: 4, borderRadius: 6, display: 'flex',
              transition: 'color 0.1s, background 0.1s',
            }}
              onMouseEnter={e => { e.currentTarget.style.color = th.text; e.currentTarget.style.background = th.columnBg; }}
              onMouseLeave={e => { e.currentTarget.style.color = th.textMuted; e.currentTarget.style.background = 'none'; }}
            >
              <IcoX size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 32px' }}>
          {/* Metadata */}
          <div style={{ background: th.bg, border: `1px solid ${th.border}`, borderRadius: 12, marginBottom: 24 }}>
            {/* Status */}
            <div style={{ ...metaRowStyle, borderBottom: `1px solid ${th.border}` }}>
              <span style={metaLabelStyle}>Status</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {columns.map(c => (
                  <button key={c.id} onClick={() => handleColumnChange(c.id)} style={{
                    padding: '3px 10px', borderRadius: 6, border: 'none', cursor: readonly ? 'default' : 'pointer',
                    fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
                    background: col === c.id ? acc + '18' : 'transparent',
                    color: col === c.id ? acc : th.textSecondary,
                    outline: col === c.id ? `1.5px solid ${acc}` : 'none',
                    transition: 'all 0.12s',
                  }}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            {/* Urgency */}
            <div style={{ ...metaRowStyle, borderBottom: `1px solid ${th.border}` }}>
              <span style={metaLabelStyle}>Urgency</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(urgMap).map(([key, u]) => (
                  <button key={key} onClick={() => patch({ urgency: key.toUpperCase() as Task['urgency'] })} style={{
                    padding: '3px 10px', borderRadius: 6, border: 'none', cursor: readonly ? 'default' : 'pointer',
                    fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                    background: urgKey === key ? u.bg : 'transparent',
                    color: urgKey === key ? u.color : th.textMuted,
                    outline: urgKey === key ? `1.5px solid ${u.border}` : 'none',
                    transition: 'all 0.12s',
                  }}>
                    {u.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Assignee — click to add/remove, multiple supported */}
            <div style={{ ...metaRowStyle, borderBottom: `1px solid ${th.border}` }}>
              <span style={metaLabelStyle}>Assignees</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {members.map(m => {
                  const selected = display.assignee_id === m.id || (display.co_assignees ?? []).some(u => u.id === m.id);
                  return (
                    <button key={m.id} onClick={() => handleAssigneeClick(m.id)} title={m.full_name} style={{
                      background: 'none', border: 'none', cursor: readonly ? 'default' : 'pointer', padding: 2, borderRadius: '50%',
                      outline: selected ? `2px solid ${acc}` : '2px solid transparent',
                      outlineOffset: 2, transition: 'outline 0.1s', opacity: selected ? 1 : 0.45,
                    }}>
                      <Avatar user={{ id: m.id, full_name: m.full_name }} size={26} />
                    </button>
                  );
                })}
                <span style={{ fontSize: 10.5, color: th.textMuted, marginLeft: 2 }}>
                  {[display.assignee_id, ...(display.co_assignees ?? []).map(u => u.id)].filter(Boolean).length > 0
                    ? `${[display.assignee_id, ...(display.co_assignees ?? []).map(u => u.id)].filter(Boolean).length} selected`
                    : 'None'}
                </span>
              </div>
            </div>
            {/* Deadline */}
            <div style={{ ...metaRowStyle, borderBottom: `1px solid ${th.border}` }}>
              <span style={metaLabelStyle}>Deadline</span>
              <DatePicker
                value={display.deadline ? display.deadline.substring(0, 10) : null}
                onChange={handleDeadlineChange}
                accent={acc}
                theme={th}
                readonly={readonly}
              />
            </div>
            {/* Project */}
            <div style={metaRowStyle}>
              <span style={metaLabelStyle}>Project</span>
              {display.project && (
                <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 20, background: projectBg, color: projectColor, fontSize: 11, fontWeight: 500 }}>
                  {display.project.name}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          <div ref={descriptionRef} style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
              Description
            </p>
            <BlockEditor
              value={display.description || ''}
              onChange={handleDescriptionChange}
              onAiResult={handleAiResult}
              accent={acc}
              theme={th}
              readonly={readonly}
              members={members}
            />
          </div>

          {/* Attachments */}
          <div style={{ marginBottom: 24 }}
            onDrop={readonly ? undefined : handleFileDrop}
            onDragOver={readonly ? undefined : handleFileDragOver}
            onDragLeave={readonly ? undefined : handleFileDragLeave}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                Attachments {attachments.length > 0 && `(${attachments.length})`}
              </p>
              {!readonly && (
                <>
                  <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    style={{
                      padding: '3px 10px', borderRadius: 6, border: `1px solid ${acc}44`,
                      background: 'none', color: acc, fontSize: 11.5, fontWeight: 600,
                      cursor: uploadingFile ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {uploadingFile ? 'Uploading…' : '+ Attach'}
                  </button>
                </>
              )}
            </div>
            {attachments.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
                {fileDragOver && !readonly && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 10,
                    background: th.columnBg, opacity: 0.9, borderRadius: 9,
                    border: `2px dashed ${acc}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: acc, fontWeight: 600, fontSize: 13, pointerEvents: 'none'
                  }}>
                    Drop to attach file
                  </div>
                )}
                {attachments.map(att => {
                  const isImg = att.content_type.startsWith('image/');
                  const sizeKb = Math.round(att.size_bytes / 1024);
                  return (
                    <div key={att.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 9,
                      border: `1px solid ${th.border}`, background: th.surface,
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 7, flexShrink: 0, overflow: 'hidden',
                        background: th.columnBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: th.textMuted,
                      }}>
                        {isImg
                          ? <img src={getDownloadUrl(att.id) + `?token=${localStorage.getItem('token') ?? ''}`}
                              alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : att.filename.split('.').pop()?.toUpperCase().slice(0, 3) ?? 'FILE'
                        }
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12.5, fontWeight: 600, color: th.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {att.filename}
                        </p>
                        <p style={{ fontSize: 11, color: th.textMuted, margin: 0 }}>
                          {sizeKb < 1024 ? `${sizeKb} KB` : `${(sizeKb / 1024).toFixed(1)} MB`}
                        </p>
                      </div>
                      <a
                        href={`${getDownloadUrl(att.id)}?token=${localStorage.getItem('token') ?? ''}`}
                        download={att.filename}
                        style={{ color: acc, fontSize: 11.5, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}
                      >
                        ↓
                      </a>
                      {!readonly && (
                        <button onClick={() => handleDeleteAttachment(att.id)} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: th.textMuted, padding: 2, flexShrink: 0, display: 'flex',
                        }}>
                          <IcoX size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {attachments.length === 0 && !readonly && (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '14px', borderRadius: 9, border: `1.5px dashed ${fileDragOver ? acc : th.border}`,
                  background: fileDragOver ? acc + '11' : 'transparent',
                  textAlign: 'center', cursor: 'pointer', color: fileDragOver ? acc : th.textMuted, fontSize: 12.5,
                  transition: 'all 0.2s',
                }}
              >
                {fileDragOver ? 'Drop file here' : 'Drop files or click "+ Attach"'}
              </div>
            )}
          </div>

          {/* Activity */}
          <div ref={commentsRef}>
            <p style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
              Activity
            </p>

            {/* Timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {timeline.length === 0 && (
                <p style={{ fontSize: 13, color: th.textMuted, fontStyle: 'italic' }}>Нет активности</p>
              )}
              {timeline.map((item, i) => {
                if (item.kind === 'comment') {
                  const c = item.data;
                  return (
                    <div key={`c${c.id}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <Avatar user={c.user ? { full_name: c.user.full_name, id: c.user.id } : null} size={26} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: th.text }}>{c.user?.full_name ?? 'User'}</span>
                          <span style={{ fontSize: 10.5, color: th.textMuted }}>{fmtTime(c.created_at)}</span>
                        </div>
                        <div style={{
                          background: th.bg, border: `1px solid ${th.border}`,
                          borderRadius: '4px 12px 12px 12px',
                          padding: '7px 11px', fontSize: 13, color: th.text, lineHeight: 1.5,
                        }}>
                          {c.text}
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  const l = item.data;
                  return (
                    <div key={`l${l.id}${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                        background: th.columnBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11,
                      }}>
                        {l.action === 'column_changed' ? '↔' : l.action === 'created' ? '✦' : l.action.startsWith('attachment') ? '📎' : '✎'}
                      </div>
                      <span style={{ fontSize: 11.5, color: th.textSecondary }}>
                        <strong>{l.user?.full_name ?? 'System'}</strong> {actionLabel(l.action)}
                        {l.action === 'column_changed' && l.new_value && (() => {
                          try { 
                            const v = JSON.parse(l.new_value); 
                            const colName = columns.find(c => c.id === v.column_id)?.name || v.column_id;
                            return ` → ${colName}`; 
                          } catch { return ''; }
                        })()}
                        {l.action === 'attachment_added' && l.new_value && ` «${l.new_value}»`}
                        {l.action === 'attachment_removed' && l.old_value && ` «${l.old_value}»`}
                      </span>
                      <span style={{ fontSize: 10.5, color: th.textMuted, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{fmtTime(l.created_at)}</span>
                    </div>
                  );
                }
              })}
              <div ref={activityEndRef} />
            </div>

            {/* Comment input */}
            <div style={{ position: 'relative' }}>
              {mentionQuery !== null && (() => {
                const filtered = members.filter(m =>
                  m.full_name.toLowerCase().includes(mentionQuery.toLowerCase())
                );
                if (!filtered.length) return null;
                return (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: 0, right: 0,
                    background: th.surface, border: `1px solid ${th.border}`,
                    borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                    zIndex: 100, marginBottom: 4, overflow: 'hidden',
                  }}>
                    {filtered.slice(0, 5).map((m, i) => (
                      <div
                        key={m.id}
                        onMouseDown={e => {
                          e.preventDefault();
                          const ta = commentInputRef.current;
                          if (!ta) return;
                          const pos = ta.selectionStart ?? commentText.length;
                          const atPos = commentText.lastIndexOf('@', pos - 1);
                          const before = commentText.slice(0, atPos);
                          const after  = commentText.slice(pos);
                          setCommentText(before + `@${m.full_name} ` + after);
                          setMentionQuery(null);
                          setTimeout(() => { ta.focus(); ta.setSelectionRange(before.length + m.full_name.length + 2, before.length + m.full_name.length + 2); }, 10);
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 12px', cursor: 'pointer',
                          background: i === mentionIdx ? acc + '14' : 'transparent',
                        }}
                        onMouseEnter={() => setMentionIdx(i)}
                      >
                        <Avatar user={{ id: m.id, full_name: m.full_name }} size={22} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: th.text }}>{m.full_name}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                ref={commentInputRef}
                value={commentText}
                onChange={e => {
                  const val = e.target.value;
                  setCommentText(val);
                  const pos = e.target.selectionStart ?? val.length;
                  const atPos = val.lastIndexOf('@', pos - 1);
                  if (atPos >= 0 && (atPos === 0 || val[atPos - 1] === ' ' || val[atPos - 1] === '\n')) {
                    const query = val.slice(atPos + 1, pos);
                    if (!query.includes(' ')) { setMentionQuery(query); setMentionIdx(0); return; }
                  }
                  setMentionQuery(null);
                }}
                onKeyDown={e => {
                  if (mentionQuery !== null) {
                    const filtered = members.filter(m => m.full_name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5);
                    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
                    if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); return; }
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      const m = filtered[mentionIdx];
                      if (m) {
                        e.preventDefault();
                        const ta = commentInputRef.current;
                        if (!ta) return;
                        const pos = ta.selectionStart ?? commentText.length;
                        const atPos = commentText.lastIndexOf('@', pos - 1);
                        const before = commentText.slice(0, atPos);
                        const after  = commentText.slice(pos);
                        setCommentText(before + `@${m.full_name} ` + after);
                        setMentionQuery(null);
                        return;
                      }
                    }
                    if (e.key === 'Escape') { setMentionQuery(null); return; }
                  }
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment(); }
                }}
                placeholder="Написать комментарий… (@ для упоминания)"
                rows={2}
                style={{
                  flex: 1, padding: '8px 11px', borderRadius: 10,
                  border: `1px solid ${th.border}`, background: th.inputBg,
                  color: th.text, fontSize: 13, fontFamily: 'inherit',
                  resize: 'none', outline: 'none',
                  transition: 'border-color 0.1s',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = acc; }}
                onBlur={e => { e.currentTarget.style.borderColor = th.border; }}
              />
              <button
                onClick={handleSendComment}
                disabled={!commentText.trim() || sendingComment}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: 'none',
                  background: commentText.trim() ? acc : th.columnBg,
                  color: commentText.trim() ? 'white' : th.textMuted,
                  cursor: commentText.trim() ? 'pointer' : 'default',
                  fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                  transition: 'all 0.12s', flexShrink: 0,
                }}
              >
                {sendingComment ? '…' : 'Отправить'}
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
