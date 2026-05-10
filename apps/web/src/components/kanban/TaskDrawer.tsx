import { useState, useEffect, useRef } from 'react';
import type { Task } from '@/types/domain';
import type { Theme, DesignColumn } from '@/theme/theme';
import { URGENCY_MAP, COLUMNS_DEF, apiUrgencyToDesign, statusToColumn, columnToStatus } from '@/theme/theme';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { DatePicker } from '@/components/ui/DatePicker';
import { Avatar } from './Avatar';
import { IcoX } from '@/components/ui/Icons';
import type { ProjectMember } from '@/api/members';
import { updateTask, changeStatus } from '@/api/tasks';
import { fetchComments, addComment } from '@/api/comments';
import { fetchAuditLogs } from '@/api/audit';
import type { Comment } from '@/api/comments';
import type { AuditLog } from '@/api/audit';
import type { TaskStatus } from '@/types/domain';

interface TaskDrawerProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (updated: Task) => void;
  members: ProjectMember[];
  accentColor: string;
  theme: Theme;
}

export function TaskDrawer({ task, open, onClose, onUpdate, members, accentColor, theme }: TaskDrawerProps) {
  const [localTask, setLocalTask] = useState<Task | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acc = accentColor;
  const th  = theme;

  // Activity state
  const [comments,  setComments]  = useState<Comment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const activityEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (task) setLocalTask(task);
  }, [task]);

  useEffect(() => {
    if (!task) return;
    fetchComments(task.id).then(setComments).catch(() => {});
    fetchAuditLogs(task.id).then(setAuditLogs).catch(() => {});
  }, [task?.id]);

  if (!task) return null;
  const display = localTask || task;

  const urgKey  = apiUrgencyToDesign(display.urgency);
  const col     = statusToColumn(display.status);

  function patch(changes: Partial<Task>) {
    const updated = { ...display, ...changes } as Task;
    setLocalTask(updated);
    onUpdate(updated);
  }

  function handleStatusChange(column: DesignColumn) {
    const newStatus = columnToStatus(column) as TaskStatus;
    changeStatus(display.id, newStatus).then(updated => {
      setLocalTask(updated);
      onUpdate(updated);
    });
  }

  function handleDescriptionChange(text: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateTask(display.id, { description: text }).then(updated => {
        setLocalTask(updated);
        onUpdate(updated);
      });
    }, 1000);
    setLocalTask(prev => prev ? { ...prev, description: text } : prev);
  }

  function handleDeadlineChange(val: string) {
    const deadline = val || null;
    updateTask(display.id, { deadline }).then(updated => {
      setLocalTask(updated);
      onUpdate(updated);
    });
  }

  function handleAssigneeClick(memberId: number) {
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
    ...auditLogs.map(l => ({ kind: 'log' as const, ts: new Date(l.created_at).getTime(), data: l })),
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
                {display.project && (
                  <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 20, background: projectBg, color: projectColor, fontSize: 11, fontWeight: 500 }}>
                    {display.project.name}
                  </span>
                )}
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
          <div style={{ background: th.bg, border: `1px solid ${th.border}`, borderRadius: 12, marginBottom: 24, overflow: 'hidden' }}>
            {/* Status */}
            <div style={{ ...metaRowStyle, borderBottom: `1px solid ${th.border}` }}>
              <span style={metaLabelStyle}>Status</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {COLUMNS_DEF.map(c => (
                  <button key={c.id} onClick={() => handleStatusChange(c.id)} style={{
                    padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
                    background: col === c.id ? acc + '18' : 'transparent',
                    color: col === c.id ? acc : th.textSecondary,
                    outline: col === c.id ? `1.5px solid ${acc}` : 'none',
                    transition: 'all 0.12s',
                  }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Urgency */}
            <div style={{ ...metaRowStyle, borderBottom: `1px solid ${th.border}` }}>
              <span style={metaLabelStyle}>Urgency</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(URGENCY_MAP).map(([key, u]) => (
                  <button key={key} onClick={() => patch({ urgency: key.toUpperCase() as Task['urgency'] })} style={{
                    padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
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
                      background: 'none', border: 'none', cursor: 'pointer', padding: 2, borderRadius: '50%',
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
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
              Description
            </p>
            <BlockEditor
              value={display.description || ''}
              onChange={handleDescriptionChange}
              accent={acc}
              theme={th}
            />
          </div>

          {/* Activity */}
          <div>
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
                        {l.action === 'status_changed' ? '↔' : l.action === 'created' ? '✦' : '✎'}
                      </div>
                      <span style={{ fontSize: 11.5, color: th.textSecondary }}>
                        <strong>{l.user?.full_name ?? 'System'}</strong> {actionLabel(l.action)}
                        {l.action === 'status_changed' && l.new_value && (() => {
                          try { const v = JSON.parse(l.new_value); return ` → ${v.status}`; } catch { return ''; }
                        })()}
                      </span>
                      <span style={{ fontSize: 10.5, color: th.textMuted, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{fmtTime(l.created_at)}</span>
                    </div>
                  );
                }
              })}
              <div ref={activityEndRef} />
            </div>

            {/* Comment input */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment(); } }}
                placeholder="Написать комментарий… (Enter — отправить)"
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
    </>
  );
}
