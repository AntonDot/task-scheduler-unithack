import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { fetchProjects } from '@/api/projects';
import { fetchTasks, changeStatus, createTask } from '@/api/tasks';
import { fetchProjectMembers } from '@/api/members';
import { runReviewScraper, type ReviewScrapeResult } from '@/api/automations';
import { fetchComments, addComment, type Comment } from '@/api/comments';
import type { Task, TaskStatus } from '@/types/domain';
import {
  COLUMNS_DEF, URGENCY_MAP, statusToColumn, columnToStatus,
  formatDeadline, isOverdue, apiUrgencyToDesign, type DesignColumn,
} from '@/theme/theme';

// ─── helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

const USER_COLORS = ['#6366F1','#8B5CF6','#EC4899','#F97316','#EAB308','#22C55E','#14B8A6','#3B82F6'];
function userColor(id: number) { return USER_COLORS[id % USER_COLORS.length]; }

// ─── icons ────────────────────────────────────────────────────────────────────

function Ico({ d, size = 22, fill, poly, circle, rect, path, line, paths = [], ...rest }: {
  d?: string; size?: number; fill?: string; poly?: string; circle?: string;
  rect?: string; path?: string; line?: string; paths?: string[];
  strokeWidth?: number;
}) {
  const sw = (rest as { strokeWidth?: number }).strokeWidth ?? 1.8;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      {d && <path d={d} />}
      {poly && <polyline points={poly} />}
      {circle && <circle cx={circle.split(' ')[0]} cy={circle.split(' ')[1]} r={circle.split(' ')[2]} />}
      {rect && <rect x={rect.split(' ')[0]} y={rect.split(' ')[1]} width={rect.split(' ')[2]} height={rect.split(' ')[3]} rx="1" />}
      {line && <line x1={line.split(' ')[0]} y1={line.split(' ')[1]} x2={line.split(' ')[2]} y2={line.split(' ')[3]} />}
      {paths.map((pd, i) => <path key={i} d={pd} />)}
      {fill && <path d={fill} fill="currentColor" stroke="none" />}
    </svg>
  );
}

const IcoBoard   = ({ s = 22 }) => <Ico size={s} paths={['M3 3h7v9H3z','M14 3h7v5h-7z','M14 12h7v9h-7z','M3 16h7v5H3z']} />;
const IcoBolt    = ({ s = 22 }) => <Ico size={s} fill="M13 2 3 14h9l-1 8 10-12h-9z" />;
const IcoUsers   = ({ s = 22 }) => <Ico size={s} paths={['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2','M23 21v-2a4 4 0 0 0-3-3.87','M16 3.13a4 4 0 0 1 0 7.75']} circle="9 7 4" />;
const IcoCog     = ({ s = 22 }) => <Ico size={s} paths={['M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z']} circle="12 12 3" />;
const IcoPlus    = ({ s = 22 }) => <Ico size={s} paths={['M12 5v14','M5 12h14']} />;
const IcoX       = ({ s = 22 }) => <Ico size={s} paths={['M18 6 6 18','M6 6l12 12']} />;
const IcoSearch  = ({ s = 22 }) => <Ico size={s} d="M21 21l-4.35-4.35" circle="11 11 8" />;
const IcoSync    = ({ s = 22, spin = false }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ animation: spin ? 'mbl-spin 1s linear infinite' : 'none', flexShrink: 0 }}>
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);
const IcoChevR   = ({ s = 22 }) => <Ico size={s} poly="9 18 15 12 9 6" />;
const IcoCheck   = ({ s = 22 }) => <Ico size={s} poly="20 6 9 17 4 12" />;

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ val, onChange, accent }: { val: boolean; onChange: (v: boolean) => void; accent: string }) {
  return (
    <div onClick={() => onChange(!val)} style={{
      width: 44, height: 26, borderRadius: 13,
      background: val ? accent : '#CBD5E1',
      position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute', top: 4, left: val ? 22 : 4,
        width: 18, height: 18, borderRadius: '50%', background: 'white',
        boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left 0.2s',
      }} />
    </div>
  );
}

// ─── Pull-to-refresh hook ─────────────────────────────────────────────────────

function usePullToRefresh(onRefresh: () => void) {
  const [pulling, setPulling] = useState(false);
  const startY = useRef(0);
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const n = node;
    function onTS(e: TouchEvent) { startY.current = e.touches[0]?.clientY ?? 0; }
    function onTM(e: TouchEvent) {
      if (n.scrollTop > 0) return;
      setPulling((e.touches[0]?.clientY ?? 0) - startY.current > 60);
    }
    function onTE() {
      if (pulling) onRefresh();
      setPulling(false);
    }
    n.addEventListener('touchstart', onTS, { passive: true });
    n.addEventListener('touchmove', onTM, { passive: true });
    n.addEventListener('touchend', onTE);
    return () => {
      n.removeEventListener('touchstart', onTS);
      n.removeEventListener('touchmove', onTM);
      n.removeEventListener('touchend', onTE);
    };
  }, [pulling, onRefresh]);

  return { el, pulling };
}

// ─── Mobile Task Card ─────────────────────────────────────────────────────────

function MobileCard({ task, onClick, accent, th }: {
  task: Task; onClick: (t: Task) => void; accent: string; th: ReturnType<typeof useTheme>['theme'];
}) {
  const [pressed, setPressed] = useState(false);
  const col = statusToColumn(task.status);
  const urg = URGENCY_MAP[apiUrgencyToDesign(task.urgency)];
  const overdue = isOverdue(task.deadline, col);

  return (
    <div
      onClick={() => onClick(task)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        background: th.surface,
        border: `1px solid ${th.border}`,
        borderLeft: `4px solid ${urg ? urg.border : accent}`,
        borderRadius: 14, padding: '13px 14px',
        cursor: 'pointer',
        transform: pressed ? 'scale(0.98)' : 'scale(1)',
        transition: 'transform 0.08s ease',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
        {task.project && (
          <span style={{
            fontSize: 10.5, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
            background: task.project.color + '22', color: task.project.color, flexShrink: 0,
          }}>{task.project.name}</span>
        )}
        {urg && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 6,
            background: urg.bg, color: urg.color, fontSize: 10.5, fontWeight: 600, flexShrink: 0,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: urg.border }} />
            {urg.label}
          </span>
        )}
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: th.text, lineHeight: 1.4, marginBottom: 10 }}>
        {task.title}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {task.assignee && (
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: userColor(task.assignee.id),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: 9, fontWeight: 700, flexShrink: 0,
            }}>
              {getInitials(task.assignee.full_name)}
            </div>
          )}
          {task.deadline && (
            <span style={{
              fontSize: 11, fontWeight: 500,
              color: overdue ? '#991B1B' : th.textSecondary,
              background: overdue ? '#FEF2F2' : 'transparent',
              padding: overdue ? '1px 5px' : '0', borderRadius: 4,
            }}>
              {formatDeadline(task.deadline)}
            </span>
          )}
        </div>
        <IcoChevR s={14} />
      </div>
    </div>
  );
}

// ─── Board View ───────────────────────────────────────────────────────────────

function BoardView({ tasks, onTaskClick, onCreateTask, syncing, accent, th }: {
  tasks: Task[]; onTaskClick: (t: Task) => void; onCreateTask: () => void;
  syncing: boolean; accent: string; th: ReturnType<typeof useTheme>['theme'];
}) {
  const [colIdx, setColIdx] = useState(0);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const col = COLUMNS_DEF[colIdx] ?? COLUMNS_DEF[0]!;
  const dotColors: Record<string, string> = {
    backlog: th.textMuted, 'in-progress': accent, review: '#D97706', done: '#059669',
  };

  const colTasks = tasks.filter(t =>
    statusToColumn(t.status) === col.id &&
    (!search || t.title.toLowerCase().includes(search.toLowerCase()))
  );

  const handleRefresh = useCallback(() => {}, []);
  const { el: ptrEl, pulling } = usePullToRefresh(handleRefresh);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: th.bg }}>
      {/* Top bar */}
      <div style={{
        padding: 'calc(var(--sat, 0px) + 14px) 16px 0',
        background: th.surface, borderBottom: `1px solid ${th.border}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9, background: accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
            }}>
              <IcoBolt s={16} />
            </div>
            <span style={{ fontSize: 17, fontWeight: 700, color: th.text, letterSpacing: '-0.02em' }}>Victory</span>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <IcoSync s={16} spin={syncing} />
            <span style={{ fontSize: 11, color: syncing ? '#F59E0B' : '#10B981', fontWeight: 600, marginRight: 4 }}>
              {syncing ? 'Sync...' : 'Live'}
            </span>
            <button onClick={() => setSearchOpen(o => !o)} style={{
              width: 36, height: 36, borderRadius: '50%',
              background: searchOpen ? accent + '18' : th.columnBg,
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: searchOpen ? accent : th.textSecondary,
            }}>
              <IcoSearch s={17} />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div style={{ marginBottom: 12, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: th.textMuted, pointerEvents: 'none' }}>
              <IcoSearch s={15} />
            </div>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks…"
              style={{
                width: '100%', padding: '10px 14px 10px 36px',
                border: `1px solid ${th.border}`, borderRadius: 12,
                fontSize: 14, background: th.inputBg, color: th.text, outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>
        )}

        {/* Column tabs */}
        <div style={{ display: 'flex', overflowX: 'auto', marginLeft: -16, marginRight: -16, paddingLeft: 16 }}>
          {COLUMNS_DEF.map((c, i) => {
            const count = tasks.filter(t => statusToColumn(t.status) === c.id).length;
            const active = i === colIdx;
            return (
              <button key={c.id} onClick={() => setColIdx(i)} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 14px', background: 'none', border: 'none',
                cursor: 'pointer', flexShrink: 0, position: 'relative',
                color: active ? accent : th.textSecondary,
                fontWeight: active ? 700 : 500, fontSize: 13.5, fontFamily: 'inherit',
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColors[c.id], opacity: active ? 1 : 0.5 }} />
                {c.label}
                <span style={{
                  background: active ? accent + '1A' : th.columnBg,
                  color: active ? accent : th.textMuted,
                  fontSize: 10.5, fontWeight: 700,
                  padding: '1px 6px', borderRadius: 10,
                }}>
                  {count}
                </span>
                {active && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 8, right: 8,
                    height: 2.5, borderRadius: '2px 2px 0 0', background: accent,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {pulling && (
        <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 12, color: accent, fontWeight: 600, background: th.bg, flexShrink: 0 }}>
          ↓ Release to refresh
        </div>
      )}

      <div ref={ptrEl} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 100px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {colTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: th.textMuted }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%', background: th.surface,
                margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <IcoCheck s={26} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: th.textSecondary, marginBottom: 4 }}>
                {search ? 'No results' : 'All clear!'}
              </p>
              <p style={{ fontSize: 13, color: th.textMuted }}>
                {search ? `No tasks for "${search}"` : 'No tasks in this column.'}
              </p>
            </div>
          ) : (
            colTasks.map(t => (
              <MobileCard key={t.id} task={t} onClick={onTaskClick} accent={accent} th={th} />
            ))
          )}
        </div>
      </div>

      {/* FAB */}
      <button onClick={onCreateTask} style={{
        position: 'absolute', right: 20,
        bottom: 'calc(var(--sab, 0px) + 80px)',
        width: 56, height: 56, borderRadius: '50%',
        background: accent, color: 'white',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 6px 24px ${accent}55`,
        zIndex: 10, transition: 'transform 0.12s',
        fontFamily: 'inherit',
      }}
        onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.93)')}
        onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <IcoPlus s={26} />
      </button>
    </div>
  );
}

// ─── Task Detail Sheet ────────────────────────────────────────────────────────

function TaskSheet({ task, open, onClose, onStatusChange, accent, th }: {
  task: Task | null; open: boolean; onClose: () => void;
  onStatusChange: (taskId: number, col: DesignColumn) => void;
  accent: string; th: ReturnType<typeof useTheme>['theme'];
}) {
  const dragY = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);

  useEffect(() => {
    if (!task) return;
    fetchComments(task.id).then(setComments).catch(() => {});
  }, [task?.id]);

  if (!task) return null;

  const col = statusToColumn(task.status);
  const urg = URGENCY_MAP[apiUrgencyToDesign(task.urgency)];
  const overdue = isOverdue(task.deadline, col);

  function handleTouchStart(e: React.TouchEvent) {
    dragY.current = e.touches[0]?.clientY ?? 0;
    setDragging(true);
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (!dragging) return;
    const dy = (e.touches[0]?.clientY ?? 0) - dragY.current;
    if (dy > 0) setDragOffset(dy);
  }
  function handleTouchEnd() {
    setDragging(false);
    if (dragOffset > 80) onClose();
    setDragOffset(0);
  }

  async function handleSendComment() {
    if (!commentText.trim() || !task) return;
    const text = commentText.trim();
    const taskId = task.id;
    setCommentText('');
    try {
      const c = await addComment(taskId, text);
      setComments(prev => [...prev, c]);
    } catch {}
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
        zIndex: 500, opacity: open ? 1 : 0, transition: 'opacity 0.25s',
        pointerEvents: open ? 'auto' : 'none', backdropFilter: 'blur(2px)',
      }} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        background: th.surface, borderRadius: '24px 24px 0 0',
        zIndex: 510, maxHeight: '92dvh',
        display: 'flex', flexDirection: 'column',
        transform: open ? `translateY(${dragOffset}px)` : 'translateY(100%)',
        transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        paddingBottom: 'var(--sab, 0px)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
      }}>
        {/* Drag handle + header */}
        <div
          onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
          style={{ padding: '14px 20px 0', flexShrink: 0, cursor: 'grab' }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, background: th.border, margin: '0 auto 14px' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              {task.project && (
                <span style={{
                  fontSize: 11, fontWeight: 500, padding: '2px 9px', borderRadius: 20,
                  background: task.project.color + '22', color: task.project.color,
                  display: 'inline-block', marginBottom: 7,
                }}>{task.project.name}</span>
              )}
              <h2 style={{ fontSize: 18, fontWeight: 700, color: th.text, lineHeight: 1.3 }}>{task.title}</h2>
            </div>
            <button onClick={onClose} style={{
              width: 36, height: 36, borderRadius: '50%', background: th.columnBg,
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: th.textMuted, flexShrink: 0,
            }}>
              <IcoX s={17} />
            </button>
          </div>
        </div>

        {/* Scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {/* Metadata */}
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20,
            paddingBottom: 16, borderBottom: `1px solid ${th.border}`,
          }}>
            <select
              value={col}
              onChange={e => onStatusChange(task.id, e.target.value as DesignColumn)}
              style={{
                padding: '7px 12px', borderRadius: 10, border: `1px solid ${th.border}`,
                background: th.surface, color: th.text, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {COLUMNS_DEF.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {urg && (
              <span style={{
                padding: '7px 12px', borderRadius: 10, border: `1px solid ${urg.border}`,
                background: urg.bg, color: urg.color, fontSize: 13, fontWeight: 600,
              }}>
                {urg.label}
              </span>
            )}
            {task.deadline && (
              <span style={{
                padding: '7px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                border: `1px solid ${overdue ? '#EF4444' : th.border}`,
                background: overdue ? '#FEF2F2' : th.columnBg,
                color: overdue ? '#991B1B' : th.textSecondary,
              }}>
                {formatDeadline(task.deadline)}
              </span>
            )}
          </div>

          {/* Assignee */}
          {task.assignee && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
                Assignee
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: userColor(task.assignee.id),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: 13, fontWeight: 700,
                }}>
                  {getInitials(task.assignee.full_name)}
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: th.text }}>{task.assignee.full_name}</p>
                  <p style={{ fontSize: 12, color: th.textMuted }}>{task.assignee.email}</p>
                </div>
              </div>
              {(task.co_assignees ?? []).length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {task.co_assignees!.map(u => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: userColor(u.id), display: 'flex', alignItems: 'center',
                        justifyContent: 'center', color: 'white', fontSize: 10, fontWeight: 700,
                      }}>
                        {getInitials(u.full_name)}
                      </div>
                      <span style={{ fontSize: 12, color: th.textSecondary }}>{u.full_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {task.description && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
                Description
              </p>
              <p style={{
                fontSize: 14, color: th.textSecondary, lineHeight: 1.6,
                background: th.columnBg, borderRadius: 10, padding: '12px 14px',
                whiteSpace: 'pre-wrap',
              }}>
                {task.description}
              </p>
            </div>
          )}

          {/* Comments */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
              Comments · {comments.length}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {comments.length === 0
                ? <p style={{ fontSize: 13, color: th.textMuted, fontStyle: 'italic' }}>No comments yet</p>
                : comments.map((c) => (
                  <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: userColor(c.user?.id ?? c.user_id),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>
                      {getInitials(c.user?.full_name ?? 'User')}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: th.text }}>{c.user?.full_name ?? 'User'}</span>
                        <span style={{ fontSize: 11, color: th.textMuted }}>
                          {new Date(c.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p style={{
                        fontSize: 13.5, color: th.textSecondary, lineHeight: 1.5,
                        background: th.columnBg, borderRadius: 10, padding: '9px 12px', margin: 0,
                      }}>{c.text}</p>
                    </div>
                  </div>
                ))
              }
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={commentText} onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendComment()}
                placeholder="Add a comment…"
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 12,
                  border: `1px solid ${th.border}`, background: th.inputBg,
                  color: th.text, fontSize: 14, outline: 'none', fontFamily: 'inherit',
                }}
              />
              <button onClick={handleSendComment} style={{
                padding: '10px 16px', borderRadius: 12, border: 'none',
                background: accent, color: 'white', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Send</button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Create Sheet ─────────────────────────────────────────────────────────────

function CreateSheet({ open, onClose, onCreate, members, accent, th }: {
  open: boolean; onClose: () => void;
  onCreate: (body: { title: string; urgency: string; assignee_id?: number; deadline?: string }) => void;
  members: Array<{ id: number; full_name: string }>; accent: string;
  th: ReturnType<typeof useTheme>['theme'];
}) {
  const [title, setTitle] = useState('');
  const [urgency, setUrgency] = useState('MEDIUM');
  const [assigneeId, setAssigneeId] = useState<number | ''>('');
  const [deadline, setDeadline] = useState('');

  function handleCreate() {
    if (!title.trim()) return;
    onCreate({
      title: title.trim(), urgency,
      assignee_id: assigneeId !== '' ? assigneeId : undefined,
      deadline: deadline || undefined,
    });
    setTitle(''); setUrgency('MEDIUM'); setAssigneeId(''); setDeadline('');
  }

  const inp = {
    width: '100%', padding: '12px 14px', borderRadius: 12,
    border: `1px solid ${th.border}`, fontSize: 15,
    background: th.inputBg, color: th.text, outline: 'none', fontFamily: 'inherit',
  };
  const lbl = { fontSize: 11.5, fontWeight: 600, color: th.textMuted, display: 'block', marginBottom: 6, letterSpacing: '0.04em' } as React.CSSProperties;

  return createPortal(
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
        zIndex: 500, opacity: open ? 1 : 0, transition: 'opacity 0.2s',
        pointerEvents: open ? 'auto' : 'none', backdropFilter: 'blur(2px)',
      }} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        background: th.surface, borderRadius: '24px 24px 0 0',
        zIndex: 510, maxHeight: '90dvh',
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        paddingBottom: 'var(--sab, 0px)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
      }}>
        <div style={{ padding: '14px 20px 0', flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: th.border, margin: '0 auto 16px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: th.text }}>New Task</h3>
            <button onClick={onClose} style={{
              width: 36, height: 36, borderRadius: '50%', background: th.columnBg,
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: th.textMuted,
            }}><IcoX s={17} /></button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={lbl}>TASK TITLE *</label>
              <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="What needs to be done?" style={{ ...inp, fontSize: 16 }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>URGENCY</label>
                <select value={urgency} onChange={e => setUrgency(e.target.value)} style={{ ...inp, padding: '12px 14px', cursor: 'pointer' }}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
              <div>
                <label style={lbl}>ASSIGNEE</label>
                <select value={assigneeId} onChange={e => setAssigneeId(e.target.value === '' ? '' : Number(e.target.value))}
                  style={{ ...inp, padding: '12px 14px', cursor: 'pointer' }}>
                  <option value="">Unassigned</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={lbl}>DEADLINE</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={inp} />
            </div>
            <button onClick={handleCreate} disabled={!title.trim()} style={{
              padding: '15px', borderRadius: 14, border: 'none',
              background: title.trim() ? accent : th.border,
              color: title.trim() ? 'white' : th.textMuted,
              fontSize: 16, fontWeight: 700, cursor: title.trim() ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
              boxShadow: title.trim() ? `0 4px 16px ${accent}44` : 'none',
              fontFamily: 'inherit',
            }}>
              Create Task
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Automations Mobile View ──────────────────────────────────────────────────

const STATIC_AUTOS = [
  { id: 'a2', name: 'Overdue escalation',    trigger: 'Deadline is overdue',      action: 'Escalate to Urgent',       active: true,  runs: 12, lastRun: '1d ago', triggerColor: '#DC2626', actionColor: '#F97316' },
  { id: 'a3', name: 'Auto-assign new tasks', trigger: 'New task created',         action: 'Assign to first available', active: false, runs: 8,  lastRun: '3d ago', triggerColor: '#4338CA', actionColor: '#6366F1' },
  { id: 'a4', name: 'Review trigger',        trigger: 'Task moves to In Review',  action: 'Create review request',    active: true,  runs: 23, lastRun: '5h ago', triggerColor: '#D97706', actionColor: '#B45309' },
];

function AutomationsMobileView({ accent, th }: { accent: string; th: ReturnType<typeof useTheme>['theme'] }) {
  const [autos, setAutos] = useState(STATIC_AUTOS);
  const [scraperActive, setScraperActive] = useState(true);
  const [scraperRunning, setScraperRunning] = useState(false);
  const [scraperRuns, setScraperRuns] = useState(0);
  const [scraperLog, setScraperLog] = useState<ReviewScrapeResult | null>(null);
  const [showLog, setShowLog] = useState(false);

  async function handleRunScraper() {
    if (scraperRunning || !scraperActive) return;
    setScraperRunning(true);
    try {
      const r = await runReviewScraper();
      setScraperRuns(n => n + 1);
      setScraperLog(r); setShowLog(true);
    } catch (e) {
      setScraperLog({ reviews_found: 0, negative_found: 0, tasks_created: 0, duplicates: 0, errors: 1, ran_at: new Date().toISOString(), details: [{ status: 'error', detail: e instanceof Error ? e.message : String(e) }] });
      setShowLog(true);
    } finally { setScraperRunning(false); }
  }

  const activeCount = (scraperActive ? 1 : 0) + autos.filter(a => a.active).length;
  const totalRuns = scraperRuns + autos.reduce((s, a) => s + a.runs, 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 'calc(var(--sat, 0px) + 20px) 16px 100px' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: th.text, marginBottom: 4 }}>Automations</h2>
      <p style={{ fontSize: 12.5, color: th.textSecondary, marginBottom: 20 }}>{activeCount} of {autos.length + 1} active</p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Runs',   value: totalRuns,  color: accent },
          { label: 'Active', value: activeCount, color: '#059669' },
          { label: 'Hours',  value: '12.4',      color: '#D97706' },
        ].map(s => (
          <div key={s.label} style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14, padding: '14px 16px' }}>
            <p style={{ fontSize: 11, color: th.textMuted, fontWeight: 500, marginBottom: 4 }}>{s.label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Review Monitor (real) */}
      <div style={{ background: th.surface, border: `1px solid ${scraperActive ? accent + '40' : th.border}`, borderRadius: 16, padding: 16, marginBottom: 10, opacity: scraperActive ? 1 : 0.6 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: th.text, margin: 0 }}>Review Monitor</p>
              <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, background: accent + '18', color: accent, border: `1px solid ${accent}30` }}>LIVE</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 500, background: '#DC262614', color: '#DC2626', border: '1px solid #DC262628', display: 'inline-block' }}>
                When: Negative review (★1-2) detected
              </span>
              <span style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 500, background: accent + '14', color: accent, border: `1px solid ${accent}28`, display: 'inline-block' }}>
                Then: Create URGENT task via AI
              </span>
            </div>
          </div>
          <Toggle val={scraperActive} onChange={setScraperActive} accent={accent} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 11, color: th.textMuted }}>{scraperRuns} runs this session</p>
          <button onClick={handleRunScraper} disabled={scraperRunning || !scraperActive} style={{
            padding: '6px 14px', borderRadius: 8, border: 'none',
            background: scraperActive ? accent : th.columnBg,
            color: scraperActive ? 'white' : th.textMuted,
            fontSize: 12, fontWeight: 600, cursor: scraperActive ? 'pointer' : 'default', fontFamily: 'inherit',
          }}>
            {scraperRunning ? '⟳ Running…' : '▶ Run now'}
          </button>
        </div>
        {showLog && scraperLog && (
          <div style={{ marginTop: 12, padding: '10px 12px', background: th.bg, borderRadius: 10, border: `1px solid ${th.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ fontSize: 11.5, fontWeight: 600, color: th.text, margin: 0 }}>Last run result</p>
              <button onClick={() => setShowLog(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, fontSize: 12 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11.5 }}>
              <span style={{ color: th.textSecondary }}><strong>{scraperLog.reviews_found}</strong> found</span>
              <span style={{ color: '#DC2626' }}><strong>{scraperLog.negative_found}</strong> negative</span>
              <span style={{ color: '#059669' }}><strong>{scraperLog.tasks_created}</strong> tasks</span>
              {scraperLog.errors > 0 && <span style={{ color: '#DC2626' }}><strong>{scraperLog.errors}</strong> errors</span>}
            </div>
          </div>
        )}
      </div>

      {/* Static automations */}
      {autos.map(auto => (
        <div key={auto.id} style={{
          background: th.surface, border: `1px solid ${th.border}`,
          borderRadius: 16, padding: 16, marginBottom: 10,
          opacity: auto.active ? 1 : 0.55, transition: 'opacity 0.2s',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: th.text, flex: 1, paddingRight: 10, margin: 0 }}>{auto.name}</p>
            <Toggle val={auto.active} onChange={v => setAutos(prev => prev.map(a => a.id === auto.id ? { ...a, active: v } : a))} accent={accent} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 500, background: auto.triggerColor + '14', color: auto.triggerColor, border: `1px solid ${auto.triggerColor}28`, display: 'inline-block' }}>
              When: {auto.trigger}
            </span>
            <span style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 500, background: auto.actionColor + '14', color: auto.actionColor, border: `1px solid ${auto.actionColor}28`, display: 'inline-block' }}>
              Then: {auto.action}
            </span>
          </div>
          <p style={{ fontSize: 11, color: th.textMuted, marginTop: 8, marginBottom: 0 }}>{auto.runs} runs · Last: {auto.lastRun}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Team Mobile View ─────────────────────────────────────────────────────────

function TeamMobileView({ tasks, members, accent, th }: {
  tasks: Task[]; members: Array<{ id: number; full_name: string; email: string }>;
  accent: string; th: ReturnType<typeof useTheme>['theme'];
}) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 'calc(var(--sat, 0px) + 20px) 16px 100px' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: th.text, marginBottom: 20 }}>Team</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {members.map(m => {
          const mt = tasks.filter(t => t.assignee_id === m.id);
          const done = mt.filter(t => t.status === 'DONE').length;
          const pct = mt.length > 0 ? (done / mt.length) * 100 : 0;
          return (
            <div key={m.id} style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{
                  width: 46, height: 46, borderRadius: '50%',
                  background: userColor(m.id),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: 15, fontWeight: 700,
                }}>
                  {getInitials(m.full_name)}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: th.text, marginBottom: 2 }}>{m.full_name}</p>
                  <p style={{ fontSize: 12, color: th.textMuted }}>{m.email}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 20, fontWeight: 700, color: accent, margin: 0 }}>{mt.length}</p>
                  <p style={{ fontSize: 10.5, color: th.textMuted }}>tasks</p>
                </div>
              </div>
              <div style={{ height: 5, background: th.columnBg, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#059669', borderRadius: 3, width: `${pct}%`, transition: 'width 0.5s' }} />
              </div>
              <p style={{ fontSize: 11, color: th.textMuted, marginTop: 6, marginBottom: 0 }}>
                {done}/{mt.length} completed · {Math.round(pct)}%
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Settings Mobile View ─────────────────────────────────────────────────────

function SettingsMobileView({ accent, th, isDark, onToggleDark, onSetAccent }: {
  accent: string; th: ReturnType<typeof useTheme>['theme'];
  isDark: boolean; onToggleDark: () => void; onSetAccent: (c: string) => void;
}) {
  const { user } = useAuthStore();
  const [notifs, setNotifs] = useState({ task_assigned: true, comment: true, deadline: true, mention: true, status_change: false });

  function Row({ label, sub, right, danger = false }: { label: string; sub?: string; right?: React.ReactNode; danger?: boolean }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: danger ? '#991B1B' : th.text, marginBottom: sub ? 2 : 0 }}>{label}</p>
          {sub && <p style={{ fontSize: 12, color: th.textMuted }}>{sub}</p>}
        </div>
        {right}
      </div>
    );
  }

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: th.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6, paddingLeft: 4 }}>{title}</p>
        <div style={{ background: th.surface, borderRadius: 16, border: `1px solid ${th.border}`, overflow: 'hidden' }}>
          {(Array.isArray(children) ? children : [children]).filter(Boolean).map((child, i, arr) => (
            <div key={i} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${th.border}` : 'none' }}>{child}</div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 'calc(var(--sat, 0px) + 20px) 16px 100px' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: th.text, marginBottom: 24 }}>Settings</h2>

      {user && (
        <div style={{
          background: th.surface, border: `1px solid ${th.border}`,
          borderRadius: 16, padding: 16, marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 54, height: 54, borderRadius: '50%',
            background: accent, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 700, flexShrink: 0,
          }}>
            {getInitials(user.full_name)}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: th.text }}>{user.full_name}</p>
            <p style={{ fontSize: 12.5, color: th.textSecondary }}>{user.email}</p>
          </div>
          <IcoChevR s={18} />
        </div>
      )}

      <Section title="Notifications">
        {[
          { key: 'task_assigned', label: 'Task assigned to me' },
          { key: 'comment', label: 'New comment on my task' },
          { key: 'deadline', label: 'Deadline reminder' },
          { key: 'mention', label: '@Mentions' },
          { key: 'status_change', label: 'Status changes' },
        ].map(item => (
          <Row key={item.key} label={item.label}
            right={<Toggle val={notifs[item.key as keyof typeof notifs]} onChange={v => setNotifs(n => ({ ...n, [item.key]: v }))} accent={accent} />}
          />
        ))}
      </Section>

      <Section title="Appearance">
        <Row label="Dark mode" sub="Switch to dark interface"
          right={<Toggle val={isDark} onChange={onToggleDark} accent={accent} />}
        />
        <div style={{ padding: '14px 16px' }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: th.text, marginBottom: 10 }}>Accent color</p>
          <div style={{ display: 'flex', gap: 10 }}>
            {['#6366F1','#7C3AED','#059669','#DC2626','#D97706','#0EA5E9'].map(c => (
              <div key={c} onClick={() => onSetAccent(c)} style={{
                width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                border: accent === c ? `3px solid ${th.text}` : '3px solid transparent',
                boxSizing: 'border-box', transition: 'border 0.12s',
              }} />
            ))}
          </div>
        </div>
      </Section>

      <Section title="Workspace">
        <Row label="Export data" sub="Download as JSON" right={<IcoChevR s={16} />} />
        <Row label="Invite teammates" sub="Add new members" right={<IcoChevR s={16} />} />
        <Row label="Delete workspace" danger right={<span style={{ fontSize: 12, color: '#991B1B' }}>Delete</span>} />
      </Section>

      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <p style={{ fontSize: 11.5, color: th.textMuted }}>Victory Task · PWA v1.0.0</p>
      </div>
    </div>
  );
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────

type MobileView = 'kanban' | 'automations' | 'team' | 'settings';

function BottomNav({ view, setView, accent, th }: {
  view: MobileView; setView: (v: MobileView) => void;
  accent: string; th: ReturnType<typeof useTheme>['theme'];
}) {
  const tabs: Array<{ id: MobileView; label: string; Icon: ({ s }: { s: number }) => JSX.Element; dot?: boolean }> = [
    { id: 'kanban',      label: 'Board',    Icon: IcoBoard },
    { id: 'automations', label: 'Automate', Icon: IcoBolt, dot: true },
    { id: 'team',        label: 'Team',     Icon: IcoUsers },
    { id: 'settings',    label: 'Settings', Icon: IcoCog  },
  ];

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0,
      background: th.dark ? 'rgba(30,41,59,0.92)' : 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(16px) saturate(160%)',
      WebkitBackdropFilter: 'blur(16px) saturate(160%)',
      borderTop: `1px solid ${th.border}`,
      display: 'flex', alignItems: 'stretch',
      paddingBottom: 'var(--sab, 0px)',
      zIndex: 100,
    }}>
      {tabs.map(tab => {
        const active = view === tab.id;
        return (
          <button key={tab.id} onClick={() => setView(tab.id)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 3, padding: '10px 6px 12px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: active ? accent : th.textMuted, transition: 'color 0.12s', fontFamily: 'inherit',
          }}>
            <div style={{ position: 'relative', transform: active ? 'scale(1.1)' : 'scale(1)', transition: 'transform 0.12s' }}>
              <tab.Icon s={22} />
              {tab.dot && (
                <div style={{
                  position: 'absolute', top: -2, right: -2,
                  width: 7, height: 7, borderRadius: '50%', background: '#059669',
                  border: `1.5px solid ${th.dark ? '#1E293B' : '#FFFFFF'}`,
                }} />
              )}
            </div>
            <span style={{ fontSize: active ? 10.5 : 10, fontWeight: active ? 700 : 500 }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main MobileApp ───────────────────────────────────────────────────────────

export function MobileApp() {
  const { theme: th, isDark, toggleTheme, accentColor: accent, setAccentColor } = useTheme();
  const queryClient = useQueryClient();

  const [view, setView] = useState<MobileView>('kanban');
  const [selTask, setSelTask] = useState<Task | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });
  const resolvedProjectId = activeProjectId ?? projects[0]?.id ?? null;

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', resolvedProjectId],
    queryFn: () => fetchTasks(resolvedProjectId!),
    enabled: !!resolvedProjectId,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members', resolvedProjectId],
    queryFn: () => fetchProjectMembers(resolvedProjectId!),
    enabled: !!resolvedProjectId,
  });

  useEffect(() => {
    const id = setInterval(() => { setSyncing(true); setTimeout(() => setSyncing(false), 1400); }, 22000);
    return () => clearInterval(id);
  }, []);

  const statusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: TaskStatus }) => changeStatus(taskId, status),
    onMutate: async ({ taskId, status }) => {
      const key = ['tasks', resolvedProjectId] as const;
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<Task[]>(key);
      queryClient.setQueryData<Task[]>(key, old =>
        (old ?? []).map(t => t.id === taskId ? { ...t, status } : t)
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tasks', resolvedProjectId], ctx.prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', resolvedProjectId] });
      setSyncing(true); setTimeout(() => setSyncing(false), 1200);
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof createTask>[1]) => createTask(resolvedProjectId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', resolvedProjectId] });
      setCreateOpen(false);
      setSyncing(true); setTimeout(() => setSyncing(false), 800);
    },
  });

  function handleTaskClick(task: Task) {
    setSelTask(task); setSheetOpen(true);
  }

  function handleStatusChange(taskId: number, col: DesignColumn) {
    const status = columnToStatus(col) as TaskStatus;
    statusMutation.mutate({ taskId, status });
    if (selTask?.id === taskId) {
      setSelTask(prev => prev ? { ...prev, status } : prev);
    }
  }

  // Project switcher in settings (expose as top-level nav element if multiple projects)
  void setActiveProjectId;

  return (
    <>
      <style>{`
        @keyframes mbl-spin { to { transform: rotate(360deg); } }
        :root { --sat: env(safe-area-inset-top, 0px); --sab: env(safe-area-inset-bottom, 0px); }
      `}</style>
      <div style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        background: th.bg, fontFamily: "'Inter', -apple-system, sans-serif",
        overflow: 'hidden', zIndex: 1,
      }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          {view === 'kanban' && (
            <BoardView
              tasks={tasks} onTaskClick={handleTaskClick}
              onCreateTask={() => setCreateOpen(true)}
              syncing={syncing} accent={accent} th={th}
            />
          )}
          {view === 'automations' && <AutomationsMobileView accent={accent} th={th} />}
          {view === 'team' && <TeamMobileView tasks={tasks} members={members} accent={accent} th={th} />}
          {view === 'settings' && (
            <SettingsMobileView
              accent={accent} th={th}
              isDark={isDark} onToggleDark={toggleTheme}
              onSetAccent={setAccentColor}
            />
          )}
        </div>

        <BottomNav view={view} setView={setView} accent={accent} th={th} />
      </div>

      <TaskSheet
        task={selTask} open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onStatusChange={handleStatusChange}
        accent={accent} th={th}
      />

      <CreateSheet
        open={createOpen} onClose={() => setCreateOpen(false)}
        onCreate={body => createMutation.mutate(body)}
        members={members} accent={accent} th={th}
      />
    </>
  );
}
