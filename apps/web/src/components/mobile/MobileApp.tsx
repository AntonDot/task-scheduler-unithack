import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { fetchProjects } from '@/api/projects';
import { fetchTasks, changeColumn, createTask, updateTask, deleteTask } from '@/api/tasks';

import { fetchProjectMembers } from '@/api/members';
import { fetchColumns } from '@/api/columns';
import { AutomationsView } from '@/pages/AutomationsView';
import { fetchComments, addComment, type Comment } from '@/api/comments';
import { fetchAttachments, uploadAttachment, deleteAttachment, getDownloadUrl, type Attachment } from '@/api/attachments';
import { fetchNotifications, type NotificationItem } from '@/api/notifications';
import { updateProfile } from '@/api/auth';
import { useT, useLangStore } from '@/i18n';
import { Avatar, getAvatarUrl, setAvatarUrl } from '@/components/kanban/Avatar';
import { getPushStatus, getPushDiagnostics, enablePushNotifications, type PushStatus } from '@/api/push';
import { fetchProjectTags, createTag, deleteTag } from '@/api/tags';
import { useTasksRealtime } from '@/hooks/useTasksRealtime';
import type { Task, BoardColumn, Tag } from '@/types/domain';
import {
  getUrgencyMap, formatDeadline, formatRelativeCreationDate, isOverdue, apiUrgencyToDesign
} from '@/theme/theme';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { ColumnsManagerModal } from '@/components/kanban/ColumnsManagerModal';
import { TagsSection } from '@/components/tags/TagsSection';
import { TaskTagList } from '@/components/tags/TaskTagList';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';

// ─── helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

const USER_COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F97316', '#EAB308', '#22C55E', '#14B8A6', '#3B82F6'];
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

const IcoBoard = ({ s = 22 }) => <Ico size={s} paths={['M3 3h7v9H3z', 'M14 3h7v5h-7z', 'M14 12h7v9h-7z', 'M3 16h7v5H3z']} />;
const IcoBolt = ({ s = 22 }) => <Ico size={s} fill="M13 2 3 14h9l-1 8 10-12h-9z" />;
const IcoUsers = ({ s = 22 }) => <Ico size={s} paths={['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75']} circle="9 7 4" />;
const IcoCog = ({ s = 22 }) => <Ico size={s} paths={['M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z']} circle="12 12 3" />;
const IcoPlus = ({ s = 22 }) => <Ico size={s} paths={['M12 5v14', 'M5 12h14']} />;
const IcoX = ({ s = 22 }) => <Ico size={s} paths={['M18 6 6 18', 'M6 6l12 12']} />;
const IcoSearch = ({ s = 22 }) => <Ico size={s} d="M21 21l-4.35-4.35" circle="11 11 8" />;

const IcoChevR = ({ s = 22 }) => <Ico size={s} poly="9 18 15 12 9 6" />;
const IcoCheck = ({ s = 22 }) => <Ico size={s} poly="20 6 9 17 4 12" />;

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

const PTR_THRESHOLD = 100;

function usePullToRefresh(onRefresh: () => void) {
  const [pullDist, setPullDist] = useState(0);
  const startY = useRef(0);
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const n = node;
    function onTS(e: TouchEvent) { startY.current = e.touches[0]?.clientY ?? 0; }
    function onTM(e: TouchEvent) {
      if (n.scrollTop > 0) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      setPullDist(dy > 0 ? Math.min(dy, PTR_THRESHOLD * 1.4) : 0);
    }
    function onTE() {
      if (pullDist >= PTR_THRESHOLD) onRefresh();
      setPullDist(0);
    }
    n.addEventListener('touchstart', onTS, { passive: true });
    n.addEventListener('touchmove', onTM, { passive: true });
    n.addEventListener('touchend', onTE);
    return () => {
      n.removeEventListener('touchstart', onTS);
      n.removeEventListener('touchmove', onTM);
      n.removeEventListener('touchend', onTE);
    };
  }, [pullDist, onRefresh]);

  const progress = Math.min(pullDist / PTR_THRESHOLD, 1);
  return { el, progress, pulling: pullDist >= PTR_THRESHOLD };
}

// ─── Circular pull-to-refresh indicator ──────────────────────────────────────

function PullIndicator({ progress, ready, accent }: { progress: number; ready: boolean; accent: string }) {
  const size = 36;
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(progress, 1);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '8px 0', background: 'transparent', flexShrink: 0,
    }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: ready ? accent + '20' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s',
      }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', position: 'absolute' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={accent + '30'} strokeWidth={2} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={accent} strokeWidth={2.5}
            strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
            style={{ transition: ready ? 'none' : 'stroke-dasharray 0.05s' }} />
        </svg>
        {ready && (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={accent}
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute' }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
    </div>
  );
}

// ─── Mobile Task Card ─────────────────────────────────────────────────────────

function MobileCard({ task, onClick, accent, th }: {
  task: Task; onClick: (t: Task) => void; accent: string; th: ReturnType<typeof useTheme>['theme'];
}) {
  const [pressed, setPressed] = useState(false);
  const urg = getUrgencyMap(th.dark)[apiUrgencyToDesign(task.urgency)];
  const overdue = isOverdue(task.deadline, false);

  const assignees = [task.assignee, ...(task.co_assignees || [])].filter(Boolean) as NonNullable<typeof task.assignee>[];
  const displayAssignees = assignees.slice(0, 5);

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
      <p style={{
        fontSize: 14, fontWeight: 600, color: th.text, lineHeight: 1.4, marginBottom: 12,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {task.title}
      </p>

      <TaskTagList tags={task.tags} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginRight: displayAssignees.length > 1 ? 2 : 0 }}>
            {displayAssignees.map((u, i) => {
              const av = getAvatarUrl(u.id);
              return (
                <div key={u.id} style={{
                  marginLeft: i > 0 ? -6 : 0,
                  position: 'relative',
                  zIndex: displayAssignees.length - i,
                  borderRadius: '50%',
                  boxShadow: `0 0 0 2px ${th.surface}`,
                  width: 24, height: 24,
                  background: av ? 'transparent' : userColor(u.id),
                  overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: 9, fontWeight: 700, flexShrink: 0,
                }}>
                  {av ? <img src={av} alt={u.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : getInitials(u.full_name)}
                </div>
              );
            })}
          </div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
      </div>
    </div>
  );
}

// ─── Board View ───────────────────────────────────────────────────────────────

const IcoBell = ({ s = 22 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

function BoardView({ tasks, columns, onTaskClick, onCreateTask, projects, activeProjectId, onProjectChange, accent, th, notifications, onBellOpen, addToast }: {
  tasks: Task[]; columns: BoardColumn[]; onTaskClick: (t: Task) => void; onCreateTask: () => void;
  projects: Array<{ id: number; name: string; color: string }>;
  activeProjectId: number | null; onProjectChange: (id: number) => void;
  accent: string; th: ReturnType<typeof useTheme>['theme'];
  notifications: (NotificationItem & { read?: boolean })[]; onBellOpen: () => void;
  addToast: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}) {
  const t = useT();
  const [colIdx, setColIdx] = useState(0);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);
  const [showColumnsMgr, setShowColumnsMgr] = useState(false);

  const col = columns[colIdx] ?? columns[0];
  const colTasks = col ? tasks.filter(t =>
    t.column_id === col.id &&
    (!search || t.title.toLowerCase().includes(search.toLowerCase()))
  ) : [];

  const activeProject = projects.find(p => p.id === activeProjectId) ?? projects[0] ?? null;

  const unreadCount = notifications.filter(n => !n.read).length;
  const handleRefresh = useCallback(() => { }, []);
  const { el: ptrEl, progress: ptrProgress, pulling: ptrReady } = usePullToRefresh(handleRefresh);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: th.bg }}>
      {/* Top bar */}
      <div style={{
        padding: 'calc(var(--sat, 0px) + 14px) 16px 0',
        background: th.surface, borderBottom: `1px solid ${th.border}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          {/* Project switcher */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setProjOpen(o => !o)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px',
              borderRadius: 10, fontFamily: 'inherit',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: activeProject?.color ?? accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0,
              }}>
                <IcoBolt s={16} />
              </div>
              <span style={{ fontSize: 17, fontWeight: 700, color: th.text, letterSpacing: '-0.02em', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeProject?.name ?? 'Victory'}
              </span>
              {projects.length > 1 && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={th.textMuted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
            </button>

            {projOpen && projects.length > 1 && (
              <>
                <div onClick={() => setProjOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 6,
                  background: th.surface, border: `1px solid ${th.border}`,
                  borderRadius: 14, padding: 6, minWidth: 200,
                  boxShadow: '0 8px 30px rgba(0,0,0,0.15)', zIndex: 201,
                }}>
                  {projects.map(p => (
                    <button key={p.id} onClick={() => { onProjectChange(p.id); setProjOpen(false); }} style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '10px 12px', background: p.id === activeProjectId ? accent + '12' : 'none',
                      border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: p.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: th.text }}>{p.name}</span>
                      {p.id === activeProjectId && (
                        <IcoCheck s={14} />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {/* Bell */}
            <button onClick={onBellOpen} style={{
              width: 36, height: 36, borderRadius: '50%',
              background: unreadCount > 0 ? accent + '18' : th.columnBg,
              border: 'none', cursor: 'pointer', position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: unreadCount > 0 ? accent : th.textSecondary,
            }}>
              <IcoBell s={17} />
              {unreadCount > 0 && (
                <div style={{
                  position: 'absolute', top: 5, right: 5,
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#EF4444', border: `1.5px solid ${th.surface}`,
                }} />
              )}
            </button>
            {/* Columns manager */}
            <button onClick={() => setShowColumnsMgr(true)} title="Manage columns" style={{
              width: 36, height: 36, borderRadius: '50%',
              background: th.columnBg,
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: th.textSecondary,
            }}>
              <IcoBoard s={17} />
            </button>
            {/* Search */}
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
              placeholder={t('common.search')}
              style={{
                width: '100%', padding: '10px 14px 10px 36px',
                border: `1px solid ${th.border}`, borderRadius: 12,
                fontSize: 14, background: th.inputBg, color: th.text, outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>
        )}

        {/* Column tabs - scrollbar hidden via .mbl-tabs CSS class */}
        <div className="mbl-tabs" style={{ display: 'flex', overflowX: 'auto', marginLeft: -16, marginRight: -16, paddingLeft: 16 }}>
          {columns.map((c, i) => {
            const count = tasks.filter(t => t.column_id === c.id).length;
            const active = i === colIdx;
            return (
              <button key={c.id} onClick={() => setColIdx(i)} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 14px', background: 'none', border: 'none',
                cursor: 'pointer', flexShrink: 0, position: 'relative',
                color: active ? accent : th.textSecondary,
                fontWeight: active ? 700 : 500, fontSize: 13.5, fontFamily: 'inherit',
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, opacity: active ? 1 : 0.5 }} />
                {c.name}
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

      {ptrProgress > 0 && <PullIndicator progress={ptrProgress} ready={ptrReady} accent={accent} />}

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

      <ColumnsManagerModal
        open={showColumnsMgr}
        onClose={() => setShowColumnsMgr(false)}
        projectId={activeProjectId ?? 0}
        columns={columns}
        tasks={tasks} // Pass tasks for deletion check
        addToast={addToast}
        theme={th}
        accent={accent}
      />

    </div>
  );
}

// ─── Task Detail Sheet ────────────────────────────────────────────────────────

function TaskSheet({
  task,
  columns,
  open,
  onClose,
  onColumnChange,
  onDescriptionChange,
  onPriorityChange,
  onDeadlineChange,
  onAssigneeToggle,
  accent,
  th,
  members,
  projectTags,
  onTagToggle,
  onCreateTag,
  onDeleteTag,
  onDeleteTask,
  isLead,
  canEditTags,
}: {
  task: Task | null;
  columns: BoardColumn[];
  open: boolean;
  onClose: () => void;
  onColumnChange: (taskId: number, colId: number) => void;
  onDescriptionChange: (taskId: number, desc: string) => void;
  onPriorityChange: (taskId: number, urgency: string) => void;
  onDeadlineChange: (taskId: number, deadline: string | null) => void;
  onAssigneeToggle?: (taskId: number, memberId: number) => void;
  accent: string; th: ReturnType<typeof useTheme>['theme'];
  members?: Array<{ id: number; full_name: string; email?: string }>;
  projectTags: Tag[];
  onTagToggle: (taskId: number, tagId: number) => void;
  onCreateTag: (name: string, color: string) => Promise<Tag | null>;
  onDeleteTag: (tagId: number) => void;
  onDeleteTask: (taskId: number) => void;
  isLead: boolean;
  canEditTags: boolean;
}) {
  const t = useT();
  const { user } = useAuthStore();
  const dragY = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileDragOver, setFileDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!task || !open) return;
    fetchComments(task.id).then(setComments).catch(() => { });
    fetchAttachments(task.id).then(setAttachments).catch(() => { });
  }, [task?.id, open]);

  if (!task) return null;

  const col = task.column_id;
  const urg = getUrgencyMap(th.dark)[apiUrgencyToDesign(task.urgency)];
  const overdue = isOverdue(task.deadline, false);

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
    } catch { }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement> | File) {
    const isEvent = 'target' in e;
    const file = isEvent ? (e as React.ChangeEvent<HTMLInputElement>).target.files?.[0] : (e as File);
    if (!file || !task) return;
    setUploadingFile(true);
    try {
      const att = await uploadAttachment(task.id, file);
      setAttachments(prev => [...prev, att]);
    } finally {
      setUploadingFile(false);
      if (isEvent) (e as React.ChangeEvent<HTMLInputElement>).target.value = '';
    }
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

  async function handleDeleteAttachment(id: number) {
    if (!confirm('Delete this file?')) return;
    try {
      await deleteAttachment(id);
      setAttachments(prev => prev.filter(a => a.id !== id));
    } catch { }
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
              <div style={{ fontSize: 12.5, color: th.textMuted, fontWeight: 500, marginBottom: 4 }}>
                {t('task.created')} {formatRelativeCreationDate(task.created_at)}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: th.text, lineHeight: 1.3, margin: 0 }}>{task.title}</h2>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={onClose} style={{
                width: 36, height: 36, borderRadius: '50%', background: th.columnBg,
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: th.textMuted, flexShrink: 0,
              }}>
                <IcoX s={17} />
              </button>
            </div>


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
              onChange={e => onColumnChange(task.id, Number(e.target.value))}
              style={{
                padding: '7px 12px', borderRadius: 10, border: `1px solid ${th.border}`,
                background: th.surface, color: th.text, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {urg && (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <select
                  value={task.urgency}
                  onChange={e => onPriorityChange(task.id, e.target.value)}
                  style={{
                    position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', zIndex: 10
                  }}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
                <span style={{
                  padding: '7px 12px', borderRadius: 10, border: `1px solid ${urg.border}`,
                  background: urg.bg, color: urg.color, fontSize: 13, fontWeight: 600,
                  display: 'inline-block'
                }}>
                  {urg.label}
                </span>
              </div>
            )}
            <div style={{ position: 'relative', display: 'inline-block' }} onClick={(e) => {
              try { e.currentTarget.querySelector('input')?.showPicker(); } catch { }
            }}>
              <input
                type="date"
                value={task.deadline ? task.deadline.substring(0, 10) : ''}
                onChange={e => onDeadlineChange(task.id, e.target.value || null)}
                style={{
                  position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', zIndex: 10
                }}
              />
              <span style={{
                padding: '7px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                border: `1px solid ${overdue ? '#EF4444' : th.border}`,
                background: overdue ? '#FEF2F2' : th.columnBg,
                color: overdue ? '#991B1B' : th.textSecondary,
                display: 'inline-block'
              }}>
                {task.deadline ? formatDeadline(task.deadline) : 'No deadline'}
              </span>
            </div>
          </div>

          {/* Assignees */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                {t('task.assignees')}
              </p>
              <button
                onClick={() => setShowAssigneePicker(p => !p)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'none', border: `1px solid ${accent}44`,
                  borderRadius: 8, padding: '3px 9px', cursor: 'pointer',
                  color: accent, fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
                }}
              >
                <IcoPlus s={12} /> Add
              </button>
            </div>

            {/* Assignee list */}
            {[task.assignee, ...(task.co_assignees ?? [])].filter(Boolean).map(u => {
              if (!u) return null;
              const av = getAvatarUrl(u.id);
              return (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: av ? 'transparent' : userColor(u.id),
                    overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0,
                  }}>
                    {av ? <img src={av} alt={u.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : getInitials(u.full_name)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: th.text }}>{u.full_name}</p>
                    {'email' in u && u.email && <p style={{ fontSize: 11.5, color: th.textMuted }}>{(u as { email: string }).email}</p>}
                  </div>
                  <button
                    onClick={() => onAssigneeToggle?.(task.id, u.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, padding: 4 }}
                  >
                    <IcoX s={14} />
                  </button>
                </div>
              );
            })}

            {/* Assignee picker dropdown */}
            {showAssigneePicker && members && (
              <div style={{
                background: th.surface, border: `1px solid ${th.border}`,
                borderRadius: 12, overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0,0,0,0.12)', marginTop: 6,
              }}>
                {members.map(m => {
                  const isAssigned = task.assignee?.id === m.id || (task.co_assignees ?? []).some(u => u.id === m.id);
                  const av = getAvatarUrl(m.id);
                  return (
                    <div
                      key={m.id}
                      onClick={() => { onAssigneeToggle?.(task.id, m.id); setShowAssigneePicker(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '11px 14px', cursor: 'pointer',
                        background: isAssigned ? accent + '0e' : 'transparent',
                        borderBottom: `1px solid ${th.border}`,
                      }}
                    >
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: av ? 'transparent' : userColor(m.id),
                        overflow: 'hidden', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: 11, fontWeight: 700,
                      }}>
                        {av ? <img src={av} alt={m.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : getInitials(m.full_name)}
                      </div>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: th.text }}>{m.full_name}</span>
                      {isAssigned && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <TagsSection
            projectTags={projectTags}
            selectedTags={task.tags ?? []}
            isLead={isLead}
            canEditTags={canEditTags}
            onToggleTag={tag => onTagToggle(task.id, tag.id)}
            onCreateTag={onCreateTag}
            onDeleteTag={onDeleteTag}
            theme={th}
            accent={accent}
          />

          {/* Description */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
              {t('task.description')}
            </p>
            <BlockEditor
              value={task.description ?? ''}
              onChange={(text) => onDescriptionChange(task.id, text)}
              theme={th}
              members={members}
            />
          </div>

          {/* Attachments */}
          <div style={{ marginBottom: 20 }}
            onDrop={handleFileDrop}
            onDragOver={handleFileDragOver}
            onDragLeave={handleFileDragLeave}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                {t('task.attachments')} {attachments.length > 0 && `(${attachments.length})`}
              </p>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: `1px solid ${accent}44`,
                  background: 'none', color: accent, fontSize: 12, fontWeight: 600,
                  cursor: uploadingFile ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}
              >
                {uploadingFile ? t('task.uploading') : t('task.attach')}
              </button>
            </div>
            {attachments.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
                {fileDragOver && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 10,
                    background: th.columnBg, opacity: 0.9, borderRadius: 10,
                    border: `2px dashed ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: accent, fontWeight: 600, fontSize: 13, pointerEvents: 'none'
                  }}>
                    {t('task.dropToAttach')}
                  </div>
                )}
                {attachments.map(att => {
                  const isImg = att.content_type.startsWith('image/');
                  const sizeKb = Math.round(att.size_bytes / 1024);
                  return (
                    <div key={att.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px', borderRadius: 10,
                      border: `1px solid ${th.border}`, background: th.columnBg,
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
                        background: th.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, color: th.textMuted, border: `1px solid ${th.border}`
                      }}>
                        {isImg
                          ? <img src={getDownloadUrl(att.id) + `?token=${localStorage.getItem('token') ?? ''}`}
                            alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : att.filename.split('.').pop()?.toUpperCase().slice(0, 3) ?? 'FILE'
                        }
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: th.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {att.filename}
                        </p>
                        <p style={{ fontSize: 12, color: th.textMuted, margin: 0 }}>
                          {sizeKb < 1024 ? `${sizeKb} KB` : `${(sizeKb / 1024).toFixed(1)} MB`}
                        </p>
                      </div>
                      <a
                        href={`${getDownloadUrl(att.id)}?token=${localStorage.getItem('token') ?? ''}`}
                        download={att.filename}
                        style={{ color: accent, fontSize: 13, fontWeight: 600, textDecoration: 'none', padding: '4px 8px' }}
                      >
                        ↓
                      </a>
                      <button onClick={() => handleDeleteAttachment(att.id)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: th.textMuted, padding: 4, display: 'flex',
                      }}>
                        <IcoX s={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '16px', borderRadius: 10, border: `1.5px dashed ${fileDragOver ? accent : th.border}`,
                  background: fileDragOver ? accent + '11' : 'transparent',
                  textAlign: 'center', cursor: 'pointer', color: fileDragOver ? accent : th.textMuted, fontSize: 13,
                  transition: 'all 0.2s',
                }}
              >
                {fileDragOver ? t('task.dropToAttach') : t('task.dropFiles')}
              </div>
            )}
          </div>

          {/* Comments */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
              Comments · {comments.length}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {comments.length === 0
                ? <p style={{ fontSize: 13, color: th.textMuted, fontStyle: 'italic' }}>No comments yet</p>
                : comments.map((c) => {
                  const cUid = c.user?.id ?? c.user_id;
                  const cAv = getAvatarUrl(cUid);
                  return (
                    <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: cAv ? 'transparent' : userColor(cUid),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: 10, fontWeight: 700, flexShrink: 0,
                        overflow: 'hidden',
                      }}>
                        {cAv
                          ? <img src={cAv} alt={c.user?.full_name ?? 'User'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : getInitials(c.user?.full_name ?? 'User')}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: th.text }}>{c.user?.full_name ?? 'User'}</span>
                          <span style={{ fontSize: 12, color: th.textMuted }}>
                            {new Date(c.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p style={{
                          fontSize: 13.5, color: th.textSecondary, lineHeight: 1.5,
                          background: th.columnBg, borderRadius: 10, padding: '9px 12px', margin: 0,
                        }}>{c.text}</p>
                      </div>
                    </div>
                  );
                })
              }
            </div>
            <div style={{ position: 'relative' }}>
              {mentionQuery !== null && members && (() => {
                const filtered = members.filter(m =>
                  m.full_name.toLowerCase().includes(mentionQuery.toLowerCase())
                ).slice(0, 5);
                if (!filtered.length) return null;
                return (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: 0,
                    marginBottom: 8, background: th.surface,
                    border: `1px solid ${th.border}`, borderRadius: 10,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    width: '100%', zIndex: 10, overflow: 'hidden'
                  }}>
                    {filtered.map((m, i) => (
                      <div
                        key={m.id}
                        onMouseDown={e => {
                          e.preventDefault();
                          const ta = commentInputRef.current;
                          if (!ta) return;
                          const pos = ta.selectionStart ?? commentText.length;
                          const atPos = commentText.lastIndexOf('@', pos - 1);
                          const before = commentText.slice(0, atPos);
                          const after = commentText.slice(pos);
                          setCommentText(before + `@${m.full_name} ` + after);
                          setMentionQuery(null);
                          setTimeout(() => { ta.focus(); ta.setSelectionRange(before.length + m.full_name.length + 2, before.length + m.full_name.length + 2); }, 20);
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 12px', cursor: 'pointer',
                          background: i === mentionIdx ? accent + '14' : 'transparent',
                        }}
                        onTouchStart={() => setMentionIdx(i)}
                      >
                        <Avatar user={{ id: m.id, full_name: m.full_name, avatar_data: (m as { avatar_data?: string | null }).avatar_data }} size={22} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: th.text }}>{m.full_name}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
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
                    if (mentionQuery !== null && members) {
                      const filtered = members.filter(m => m.full_name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5);
                      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); return; }
                      if (e.key === 'Enter' || e.key === 'Tab') {
                        const m = filtered[mentionIdx];
                        if (m) {
                          e.preventDefault();
                          const ta = commentInputRef.current;
                          if (!ta) return;
                          const pos = ta.selectionStart ?? commentText.length;
                          const atPos = commentText.lastIndexOf('@', pos - 1);
                          const before = commentText.slice(0, atPos);
                          const after = commentText.slice(pos);
                          setCommentText(before + `@${m.full_name} ` + after);
                          setMentionQuery(null);
                          setTimeout(() => { ta.focus(); ta.setSelectionRange(before.length + m.full_name.length + 2, before.length + m.full_name.length + 2); }, 20);
                          return;
                        }
                      }
                      if (e.key === 'Escape') { setMentionQuery(null); return; }
                    }
                    if (e.key === 'Enter') handleSendComment();
                  }}
                  placeholder={t('task.comment.placeholder')}
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
                }}>{t('task.comment.send')}</button>
              </div>
            </div>

            {/* Delete Task Button at the very bottom */}
            {(isLead || task.creator_id === user?.id) && (
              <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${th.border}` }}>
                <button
                  onClick={() => {
                    if (confirm(`Вы уверены, что хотите удалить таску ${task.title}?`)) {
                      onDeleteTask(task.id);
                    }
                  }}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 14,
                    border: '1.5px solid #FCA5A5', background: '#FEF2F2',
                    color: '#DC2626', fontSize: 15, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  }}
                >
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </svg>
                  {t('task.deleteTask')}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </>,
    document.body,
  );
}

// ─── Create Sheet ─────────────────────────────────────────────────────────────

function CreateSheet({ open, onClose, onCreate, members, accent, th, projectTags, onCreateTagAsync, onDeleteTag, isLead }: {
  open: boolean; onClose: () => void;
  onCreate: (body: { title: string; urgency: string; assignee_id?: number; deadline?: string; tag_ids?: number[] }) => void;
  members: Array<{ id: number; full_name: string }>; accent: string;
  th: ReturnType<typeof useTheme>['theme'];
  projectTags: Tag[];
  onCreateTagAsync: (name: string, color: string) => Promise<Tag | null>;
  onDeleteTag: (tagId: number) => void;
  isLead: boolean;
}) {
  const [title, setTitle] = useState('');
  const [urgency, setUrgency] = useState('MEDIUM');
  const [assigneeId, setAssigneeId] = useState<number | ''>('');
  const [deadline, setDeadline] = useState('');
  const [tagIds, setTagIds] = useState<number[]>([]);

  useEffect(() => {
    if (open) {
      setTitle(''); setUrgency('MEDIUM'); setAssigneeId(''); setDeadline(''); setTagIds([]);
    }
  }, [open]);

  function handleCreate() {
    if (!title.trim()) return;
    onCreate({
      title: title.trim(), urgency,
      assignee_id: assigneeId !== '' ? assigneeId : undefined,
      deadline: deadline || undefined,
      tag_ids: tagIds,
    });
  }

  function toggleTag(tagId: number) {
    setTagIds(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]);
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
            <TagsSection
              projectTags={projectTags}
              selectedTags={projectTags.filter(t => tagIds.includes(t.id))}
              isLead={isLead}
              canEditTags
              onToggleTag={tag => toggleTag(tag.id)}
              onCreateTag={onCreateTagAsync}
              onDeleteTag={tagId => {
                onDeleteTag(tagId);
                setTagIds(prev => prev.filter(id => id !== tagId));
              }}
              theme={th}
              accent={accent}
              layout="compact"
            />

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

// ─── Team Mobile View ─────────────────────────────────────────────────────────

function TeamMobileView({ tasks, members, accent, th, doneColumnId }: {
  tasks: Task[]; members: Array<{ id: number; full_name: string; email: string }>;
  accent: string; th: ReturnType<typeof useTheme>['theme'];
  doneColumnId?: number;
}) {
  const t = useT();
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 'calc(var(--sat, 0px) + 20px) 16px 100px' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: th.text, marginBottom: 20 }}>{t('nav.team')}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {members.map(m => {
          const mt = tasks.filter(t => t.assignee_id === m.id);
          const done = doneColumnId ? mt.filter(t => t.column_id === doneColumnId).length : 0;
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

// ─── Push notification status row ────────────────────────────────────────────

function PushNotifRow({ accent, th }: { accent: string; th: ReturnType<typeof useTheme>['theme'] }) {
  const [status, setStatus] = useState<PushStatus>('checking');
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const diag = getPushDiagnostics();

  useEffect(() => {
    getPushStatus().then(setStatus).catch(() => setStatus('unsupported'));
  }, []);

  const statusMeta: Record<Exclude<PushStatus, 'checking'>, { label: string; sub: string; btnLabel?: string; color: string }> = {
    'no-https': { label: 'No HTTPS', sub: 'App must be opened over HTTPS for push to work', color: '#EF4444' },
    unsupported: {
      label: 'Not supported',
      sub: diag.ios
        ? 'Requires iOS 16.4+ — open the app from the Home Screen icon'
        : 'Push notifications are not supported in this browser',
      color: th.textMuted,
    },
    'needs-pwa': { label: 'Add to Home Screen', sub: 'Tap Share → Add to Home Screen, then reopen the app', color: '#D97706' },
    denied: { label: 'Blocked', sub: 'Go to iOS Settings → Victory → Notifications → Allow', color: '#EF4444' },
    subscribed: { label: 'Enabled', sub: 'Push notifications are active ✓', color: '#059669' },
    unsubscribed: { label: 'Disabled', sub: 'Tap Enable to receive push notifications', btnLabel: 'Enable', color: th.textMuted },
  };

  if (status === 'checking') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: th.text }}>Push notifications</p>
        <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${accent}`, borderTopColor: 'transparent', animation: 'mbl-spin 0.8s linear infinite' }} />
      </div>
    );
  }

  const meta = statusMeta[status];

  async function handleEnable() {
    setLoading(true);
    const next = await enablePushNotifications();
    setStatus(next);
    setLoading(false);
  }

  return (
    <div style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: th.text, margin: 0 }}>Push notifications</p>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
          </div>
          <p style={{ fontSize: 11.5, color: th.textMuted, margin: '2px 0 0', lineHeight: 1.4 }}>{meta.sub}</p>
        </div>
        {meta.btnLabel && (
          <button
            onClick={handleEnable}
            disabled={loading}
            style={{
              padding: '7px 14px', borderRadius: 10, border: 'none',
              background: loading ? th.columnBg : accent,
              color: loading ? th.textMuted : 'white',
              fontSize: 12.5, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
              fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            {loading ? '…' : meta.btnLabel}
          </button>
        )}
      </div>
      {/* Collapsible debug panel */}
      {status !== 'subscribed' && (
        <div style={{ marginTop: 6 }}>
          <button
            onClick={() => setShowDebug(v => !v)}
            style={{ fontSize: 11, color: th.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
          >
            {showDebug ? '▾ debug' : '▸ debug'}
          </button>
          {showDebug && (
            <pre style={{
              marginTop: 4, padding: '8px 10px', borderRadius: 8,
              background: th.columnBg, border: `1px solid ${th.border}`,
              fontSize: 10, color: th.textMuted, lineHeight: 1.5,
              overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {JSON.stringify(diag, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Settings Mobile View ─────────────────────────────────────────────────────

function SettingsMobileView({ accent, th, isDark, onToggleDark, onSetAccent }: {
  accent: string; th: ReturnType<typeof useTheme>['theme'];
  isDark: boolean; onToggleDark: () => void; onSetAccent: (c: string) => void;
}) {
  const t = useT();
  const { language, setLanguage } = useLangStore();
  const { user, clearAuth, setAuth, token } = useAuthStore();
  const [notifs, setNotifs] = useState({ task_assigned: true, comment: true, deadline: true, mention: true, status_change: false });
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const mobileAvatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarKey, setAvatarKey] = useState(0);

  async function handleMobileAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setAvatarUrl(user.id, dataUrl);
      setAvatarKey(k => k + 1);
      try {
        const updated = await updateProfile({ avatar_data: dataUrl });
        if (token) setAuth({ ...user, avatar_data: updated.avatar_data ?? dataUrl }, token);
      } catch { }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

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

  function openEditProfile() {
    setProfileName(user?.full_name ?? '');
    setProfileEmail(user?.email ?? '');
    setProfileError('');
    setEditingProfile(true);
  }

  async function saveProfile() {
    if (!profileName.trim()) { setProfileError('Name is required'); return; }
    if (!profileEmail.trim()) { setProfileError('Email is required'); return; }
    setProfileSaving(true);
    setProfileError('');
    try {
      const updated = await updateProfile({ full_name: profileName.trim(), email: profileEmail.trim() });
      if (user && token) setAuth({ ...user, full_name: updated.full_name, email: updated.email }, token);
      setEditingProfile(false);
    } catch (e: unknown) {
      setProfileError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 'calc(var(--sat, 0px) + 20px) 16px 100px' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: th.text, marginBottom: 24 }}>{t('settings.title')}</h2>

      {user && (
        <div
          onClick={openEditProfile}
          style={{
            background: th.surface, border: `1px solid ${th.border}`,
            borderRadius: 16, padding: 16, marginBottom: 24,
            display: 'flex', alignItems: 'center', gap: 14,
            cursor: 'pointer',
          }}
        >
          {(() => {
            const av = getAvatarUrl(user.id);
            return (
              <div style={{
                width: 54, height: 54, borderRadius: '50%',
                background: av ? 'transparent' : accent,
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 700, flexShrink: 0,
                overflow: 'hidden',
              }}>
                {av
                  ? <img src={av} alt={user.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : getInitials(user.full_name)}
              </div>
            );
          })()}
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: th.text }}>{user.full_name}</p>
            <p style={{ fontSize: 12.5, color: th.textSecondary }}>{user.email}</p>
          </div>
          <IcoChevR s={18} />
        </div>
      )}

      {/* Inline profile edit modal */}
      {editingProfile && createPortal(
        <>
          <div onClick={() => setEditingProfile(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 700, backdropFilter: 'blur(2px)' }} />
          <div style={{
            position: 'fixed', left: 16, right: 16, top: '50%', transform: 'translateY(-50%)',
            background: th.surface, borderRadius: 20, padding: '24px 20px',
            zIndex: 710, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: th.text, margin: 0 }}>{t('settings.editProfile')}</h3>
              <button onClick={() => setEditingProfile(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, padding: 4 }}>
                <IcoX s={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Avatar upload section */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
                {(() => {
                  const av = user ? getAvatarUrl(user.id) : null;
                  return (
                    <div
                      onClick={() => mobileAvatarInputRef.current?.click()}
                      style={{
                        width: 72, height: 72, borderRadius: '50%',
                        background: av ? 'transparent' : accent,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: 24, fontWeight: 700,
                        overflow: 'hidden', cursor: 'pointer', position: 'relative',
                      }}
                    >
                      {av
                        ? <img key={avatarKey} src={av} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : (user ? getInitials(user.full_name) : '')}
                      <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: '50%',
                      }}>
                        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                      </div>
                    </div>
                  );
                })()}
                <p style={{ fontSize: 11.5, color: th.textMuted, marginTop: 8 }}>{t('common.tapToChangePhoto')}</p>
                <input ref={mobileAvatarInputRef} type="file" accept="image/*" onChange={handleMobileAvatarChange} style={{ display: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: th.textMuted, display: 'block', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('settings.fullName')}</label>
                <input
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  placeholder={t('settings.yourName')}
                  style={{
                    width: '100%', padding: '11px 14px', borderRadius: 12,
                    border: `1px solid ${th.border}`, background: th.inputBg,
                    color: th.text, fontSize: 15, outline: 'none', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: th.textMuted, display: 'block', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('settings.email')}</label>
                <input
                  value={profileEmail}
                  onChange={e => setProfileEmail(e.target.value)}
                  placeholder="your@email.com"
                  type="email"
                  style={{
                    width: '100%', padding: '11px 14px', borderRadius: 12,
                    border: `1px solid ${th.border}`, background: th.inputBg,
                    color: th.text, fontSize: 15, outline: 'none', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              {profileError && <p style={{ fontSize: 12.5, color: '#DC2626', margin: 0 }}>{profileError}</p>}
              <button
                onClick={saveProfile}
                disabled={profileSaving}
                style={{
                  padding: '13px', borderRadius: 12, border: 'none',
                  background: profileSaving ? th.columnBg : accent,
                  color: profileSaving ? th.textMuted : 'white',
                  fontSize: 15, fontWeight: 700, cursor: profileSaving ? 'default' : 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.15s',
                }}
              >
                {profileSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}

      <Section title={t('settings.notifications')}>
        <PushNotifRow accent={accent} th={th} />
        {[
          { key: 'task_assigned', label: t('settings.notifTaskAssigned') },
          { key: 'comment', label: t('settings.notifNewComment') },
          { key: 'deadline', label: t('settings.notifDeadline') },
          { key: 'mention', label: t('settings.notifMention') },
          { key: 'status_change', label: t('settings.notifStatusChange') },
        ].map(item => (
          <Row key={item.key} label={item.label}
            right={<Toggle val={notifs[item.key as keyof typeof notifs]} onChange={v => setNotifs(n => ({ ...n, [item.key]: v }))} accent={accent} />}
          />
        ))}
      </Section>

      <Section title={t('settings.appearance')}>
        <Row label={t('settings.darkMode')} sub={t('settings.darkModeHint')}
          right={<Toggle val={isDark} onChange={onToggleDark} accent={accent} />}
        />
        <div style={{ padding: '14px 16px' }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: th.text, marginBottom: 10 }}>{t('settings.accentColor')}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            {['#6366F1', '#7C3AED', '#059669', '#DC2626', '#D97706', '#0EA5E9'].map(c => (
              <div key={c} onClick={() => onSetAccent(c)} style={{
                width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                border: accent === c ? `3px solid ${th.text}` : '3px solid transparent',
                boxSizing: 'border-box', transition: 'border 0.12s',
              }} />
            ))}
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${th.border}` }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: th.text, margin: '0 0 8px' }}>{t('settings.language')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['en', 'ru', 'he'] as const).map(lang => (
              <button
                key={lang}
                onClick={() => {
                  setLanguage(lang);
                  updateProfile({ language: lang }).catch(() => {});
                }}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  border: `2px solid ${language === lang ? accent : th.border}`,
                  background: language === lang ? accent + '18' : 'transparent',
                  color: language === lang ? accent : th.textSecondary,
                  cursor: 'pointer',
                }}
              >
                {t(`languages.${lang}`)}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title={t('settings.workspace')}>
        <Row label={t('common.inviteTeammates')} sub={t('common.addNewMembers')} right={<IcoChevR s={16} />} />
      </Section>

      <button onClick={clearAuth} style={{
        width: '100%', padding: '15px', borderRadius: 14,
        border: `1px solid #FECACA`, background: '#FEF2F2',
        color: '#DC2626', fontSize: 15, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16,
      }}>
        {t('sidebar.signOut')}
      </button>

      <div style={{ textAlign: 'center', padding: '4px 0 12px' }}>
        <p style={{ fontSize: 11.5, color: th.textMuted }}>Victory Task · PWA v1.0.0</p>
      </div>
    </div>
  );
}

// ─── Notification sheet ───────────────────────────────────────────────────────

function timeAgoMbl(iso: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('common.justNow');
  if (m < 60) return t('common.minutesAgo', { m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('common.hoursAgo', { h });
  return t('common.daysAgo', { d: Math.floor(h / 24) });
}

function NotificationSheet({ notifications, open, onClose, onMarkAllRead, onMarkRead, onOpenTask, accent, th }: {
  notifications: Array<NotificationItem & { read: boolean }>;
  open: boolean; onClose: () => void;
  onMarkAllRead: () => void;
  onMarkRead?: (id: string) => void;
  onOpenTask?: (taskId: number, section?: 'comments' | 'description') => void;
  accent: string; th: ReturnType<typeof useTheme>['theme'];
}) {
  const t = useT();
  return createPortal(
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
        zIndex: 600, opacity: open ? 1 : 0, transition: 'opacity 0.25s',
        pointerEvents: open ? 'auto' : 'none', backdropFilter: 'blur(2px)',
      }} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        background: th.surface, borderRadius: '24px 24px 0 0',
        zIndex: 610, maxHeight: '82dvh',
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        paddingBottom: 'var(--sab, 0px)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${th.border}`, flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: th.border, margin: '0 auto 14px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: th.text }}>{t('notifications.title')}</h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={onMarkAllRead} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, color: accent, fontFamily: 'inherit',
              }}>{t('notifications.markAllRead')}</button>
              <button onClick={onClose} style={{
                width: 30, height: 30, borderRadius: '50%', background: th.columnBg,
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: th.textMuted,
              }}>
                <IcoX s={15} />
              </button>
            </div>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }}>
          {notifications.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: th.textMuted, fontSize: 14 }}>
              {t('notifications.empty')}
            </div>
          ) : (
            notifications.map(n => {
              const unread = !n.read;
              const section = (n.type === 'comment' || n.type === 'mention') ? 'comments' : undefined;
              return (
                <div
                  key={n.id}
                  onClick={() => { onMarkRead?.(n.id); onClose(); if (n.task_id != null) onOpenTask?.(n.task_id, section); }}
                  style={{
                    display: 'flex', gap: 12, padding: '13px 20px',
                    borderBottom: `1px solid ${th.border}`,
                    background: unread ? accent + '08' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 7,
                    background: unread ? accent : 'transparent',
                  }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: th.text, marginBottom: 2 }}>
                      {n.action_key ? (t(`notifications.actionLabels.${n.action_key}`) || n.title) : n.title}
                    </p>
                    <p style={{ fontSize: 12.5, color: th.textSecondary, lineHeight: 1.4, marginBottom: 3 }}>{n.body}</p>
                    <p style={{ fontSize: 11, color: th.textMuted }}>{timeAgoMbl(n.created_at, t)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────

type MobileView = 'kanban' | 'automations' | 'team' | 'settings';

function BottomNav({ view, setView, accent, th }: {
  view: MobileView; setView: (v: MobileView) => void;
  accent: string; th: ReturnType<typeof useTheme>['theme'];
}) {
  const t = useT();
  const tabs: Array<{ id: MobileView; label: string; Icon: ({ s }: { s: number }) => React.JSX.Element; dot?: boolean }> = [
    { id: 'kanban', label: t('nav.board'), Icon: IcoBoard },
    { id: 'automations', label: t('nav.automations'), Icon: IcoBolt, dot: true },
    { id: 'team', label: t('nav.team'), Icon: IcoUsers },
    { id: 'settings', label: t('settings.title'), Icon: IcoCog },
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
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const { user, projectRoles } = useAuthStore();
  const { toasts, addToast, removeToast } = useToast();
  const NOTIF_READ_KEY = `vt_read_notifs_${user?.id || 'default'}`;
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(NOTIF_READ_KEY) ?? '[]') as string[]); }
    catch { return new Set<string>(); }
  });

  // Re-initialize when user changes
  useEffect(() => {
    try { setReadIds(new Set(JSON.parse(localStorage.getItem(NOTIF_READ_KEY) ?? '[]') as string[])); }
    catch { setReadIds(new Set()); }
  }, [NOTIF_READ_KEY]);

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });
  const resolvedProjectId = activeProjectId ?? projects[0]?.id ?? null;

  const role = resolvedProjectId ? projectRoles[resolvedProjectId] : undefined;
  const isLead = role === 'OWNER';
  const isAssigneeOnSelected = selTask?.assignee_id === user?.id || (selTask?.co_assignees ?? []).some(a => a.id === user?.id);
  const canEditTagsOnSelected = isLead || selTask?.creator_id === user?.id || isAssigneeOnSelected;

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

  // Seed avatar cache from member avatar_data returned by the server
  useEffect(() => {
    members.forEach(m => {
      if (m.avatar_data) setAvatarUrl(m.id, m.avatar_data);
    });
  }, [members]);

  const { data: columns = [] } = useQuery({
    queryKey: ['columns', resolvedProjectId],
    queryFn: () => fetchColumns(resolvedProjectId!),
    enabled: !!resolvedProjectId,
  });

  const { data: projectTags = [] } = useQuery({
    queryKey: ['tags', resolvedProjectId],
    queryFn: () => fetchProjectTags(resolvedProjectId!),
    enabled: !!resolvedProjectId,
  });

  const { data: rawNotifs = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    refetchInterval: 30_000,
  });

  // Real-time updates via WebSocket
  useTasksRealtime(resolvedProjectId);

  // Persist read IDs to localStorage
  useEffect(() => {
    localStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...readIds]));
  }, [readIds, NOTIF_READ_KEY]);

  // Push registration is now user-initiated from Settings (not auto-called here)

  // Enrich notifications with local read state
  const notifications = rawNotifs.map(n => ({ ...n, read: readIds.has(n.id) })).slice(0, 20);

  const columnMutation = useMutation({
    mutationFn: ({ taskId, column_id }: { taskId: number; column_id: number }) => changeColumn(taskId, column_id),
    onMutate: async ({ taskId, column_id }) => {
      const key = ['tasks', resolvedProjectId] as const;
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<Task[]>(key);
      queryClient.setQueryData<Task[]>(key, old =>
        (old ?? []).map(t => t.id === taskId ? { ...t, column_id } : t)
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tasks', resolvedProjectId], ctx.prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', resolvedProjectId] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof createTask>[1]) => createTask(resolvedProjectId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', resolvedProjectId] });
      setCreateOpen(false);
    },
  });

  function handleTaskClick(task: Task) {
    setSelTask(task); setSheetOpen(true);
  }

  function handleColumnChange(taskId: number, column_id: number) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const isAssignee = task.assignee_id === user?.id || (task.co_assignees ?? []).some(a => a.id === user?.id);

    if (!isLead && !isAssignee) {
      addToast("У вас недостаточно прав для перемещения этой задачи. Изменять статус могут только исполнители или менеджеры проекта.", "warning");
      return;
    }

    columnMutation.mutate({ taskId, column_id });
    if (selTask?.id === taskId) {
      setSelTask(prev => prev ? { ...prev, column_id } : prev);
    }
  }

  function handleDescriptionChange(taskId: number, desc: string) {
    updateTask(taskId, { description: desc }).catch(() => { });
    if (selTask?.id === taskId) {
      setSelTask(prev => prev ? { ...prev, description: desc } : prev);
    }
    const key = ['tasks', resolvedProjectId] as const;
    queryClient.setQueryData<Task[]>(key, old =>
      (old ?? []).map(t => t.id === taskId ? { ...t, description: desc } : t)
    );
  }

  function handlePriorityChange(taskId: number, urgency: string) {
    updateTask(taskId, { urgency: urgency as Task['urgency'] }).catch(() => { });
    if (selTask?.id === taskId) {
      setSelTask(prev => prev ? { ...prev, urgency: urgency as Task['urgency'] } : prev);
    }
    const key = ['tasks', resolvedProjectId] as const;
    queryClient.setQueryData<Task[]>(key, old =>
      (old ?? []).map(t => t.id === taskId ? { ...t, urgency: urgency as Task['urgency'] } : t)
    );
  }

  function handleDeadlineChange(taskId: number, deadline: string | null) {
    updateTask(taskId, { deadline }).catch(() => { });
    if (selTask?.id === taskId) {
      setSelTask(prev => prev ? { ...prev, deadline } : prev);
    }
    const key = ['tasks', resolvedProjectId] as const;
    queryClient.setQueryData<Task[]>(key, old =>
      (old ?? []).map(t => t.id === taskId ? { ...t, deadline } : t)
    );
  }

  async function handleAssigneeToggle(taskId: number, memberId: number) {
    const task = tasks.find(t => t.id === taskId) ?? selTask;
    if (!task) return;

    const coIds = (task.co_assignees ?? []).map(u => u.id);
    const isAssigned = task.assignee?.id === memberId || coIds.includes(memberId);

    let newAssigneeId: number | null = task.assignee?.id ?? null;
    let newCoIds: number[] = [...coIds];

    if (isAssigned) {
      // Remove the member
      if (task.assignee?.id === memberId) {
        newAssigneeId = newCoIds[0] ?? null;
        newCoIds = newCoIds.slice(1);
      } else {
        newCoIds = newCoIds.filter(id => id !== memberId);
      }
    } else {
      // Add the member
      if (!newAssigneeId) {
        newAssigneeId = memberId;
      } else {
        newCoIds = [...newCoIds, memberId];
      }
    }

    try {
      const updated = await updateTask(taskId, {
        assignee_id: newAssigneeId,
        co_assignee_ids: newCoIds,
      });
      const key = ['tasks', resolvedProjectId] as const;
      queryClient.setQueryData<Task[]>(key, old =>
        (old ?? []).map(t => t.id === taskId ? { ...t, ...updated } : t)
      );
      if (selTask?.id === taskId) {
        setSelTask(prev => prev ? { ...prev, ...updated } : prev);
      }
    } catch { }
  }

  async function handleTagToggle(taskId: number, tagId: number) {
    const task = tasks.find(t => t.id === taskId) ?? selTask;
    if (!task) return;

    const isAssignee = task.assignee_id === user?.id || (task.co_assignees ?? []).some(a => a.id === user?.id);
    if (!isLead && task.creator_id !== user?.id && !isAssignee) return;

    const currentTags = task.tags ?? [];
    const hasTag = currentTags.some(t => t.id === tagId);
    let newTags: Tag[];
    if (hasTag) {
      newTags = currentTags.filter(t => t.id !== tagId);
    } else {
      const tagToAdd = projectTags.find(t => t.id === tagId);
      if (!tagToAdd) return;
      newTags = [...currentTags, tagToAdd];
    }

    // Optimistic update
    const key = ['tasks', resolvedProjectId] as const;
    queryClient.setQueryData<Task[]>(key, old =>
      (old ?? []).map(t => t.id === taskId ? { ...t, tags: newTags } : t)
    );
    if (selTask?.id === taskId) {
      setSelTask(prev => prev ? { ...prev, tags: newTags } : prev);
    }

    try {
      const updated = await updateTask(taskId, { tag_ids: newTags.map(t => t.id) });
      queryClient.setQueryData<Task[]>(key, old =>
        (old ?? []).map(t => t.id === taskId ? { ...t, ...updated } : t)
      );
      if (selTask?.id === taskId) {
        setSelTask(prev => prev ? { ...prev, ...updated } : prev);
      }
    } catch {
      // Rollback? For now just rely on next sync or refetch
    }
  }

  async function handleCreateTag(name: string, color: string) {
    if (!isLead || !resolvedProjectId) return null;
    try {
      const tag = await createTag(resolvedProjectId, { name, color });
      const key = ['tags', resolvedProjectId] as const;
      queryClient.setQueryData<Tag[]>(key, old => [...(old ?? []), tag]);
      return tag;
    } catch {
      return null;
    }
  }

  async function handleDeleteTag(tagId: number) {
    if (!isLead || !resolvedProjectId) return;
    try {
      await deleteTag(tagId);
      queryClient.setQueryData<Tag[]>(['tags', resolvedProjectId], old => (old ?? []).filter(t => t.id !== tagId));
      queryClient.setQueryData<Task[]>(['tasks', resolvedProjectId], old =>
        (old ?? []).map(t => ({
          ...t,
          tags: (t.tags ?? []).filter(tag => tag.id !== tagId),
        }))
      );
      if (selTask) {
        setSelTask(prev => prev ? { ...prev, tags: (prev.tags ?? []).filter(t => t.id !== tagId) } : prev);
      }
    } catch { }
  }

  async function handleDeleteTask(taskId: number) {
    const task = tasks.find(t => t.id === taskId);
    if (!isLead && task?.creator_id !== user?.id) return;
    try {
      await deleteTask(taskId);
      const key = ['tasks', resolvedProjectId] as const;
      queryClient.setQueryData<Task[]>(key, old => (old ?? []).filter(t => t.id !== taskId));
      setSheetOpen(false);
      setSelTask(null);
    } catch { }
  }


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
             tasks={tasks} columns={columns} onTaskClick={handleTaskClick}
             onCreateTask={() => setCreateOpen(true)}
             projects={projects} activeProjectId={resolvedProjectId}
             onProjectChange={id => setActiveProjectId(id)}
             accent={accent} th={th}
             notifications={notifications}
             onBellOpen={() => setBellOpen(true)}
             addToast={addToast}
           />
          )}

          {view === 'automations' && <AutomationsView projectId={resolvedProjectId ?? 0} accent={accent} theme={th} isMobile={true} />}
          {view === 'team' && <TeamMobileView tasks={tasks} members={members} accent={accent} th={th} doneColumnId={columns[columns.length - 1]?.id} />}
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
        task={selTask} columns={columns} open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onColumnChange={handleColumnChange}
        onDescriptionChange={handleDescriptionChange}
        onPriorityChange={handlePriorityChange}
        onDeadlineChange={handleDeadlineChange}
        onAssigneeToggle={handleAssigneeToggle}
        accent={accent} th={th}
        members={members}
        projectTags={projectTags}
        onTagToggle={handleTagToggle}
        onCreateTag={handleCreateTag}
        onDeleteTag={handleDeleteTag}
        onDeleteTask={handleDeleteTask}
        isLead={isLead}
        canEditTags={!!canEditTagsOnSelected}
      />


      <CreateSheet
        open={createOpen} onClose={() => setCreateOpen(false)}
        onCreate={body => createMutation.mutate(body)}
        members={members} accent={accent} th={th}
        projectTags={projectTags}
        onCreateTagAsync={handleCreateTag}
        onDeleteTag={handleDeleteTag}
        isLead={isLead}
      />

      <NotificationSheet
        open={bellOpen}
        onClose={() => setBellOpen(false)}
        notifications={notifications}
        onMarkAllRead={() => {
          const allIds = new Set(rawNotifs.map(n => n.id));
          setReadIds(allIds);
        }}
        onMarkRead={(id) => setReadIds(prev => new Set([...prev, id]))}
        accent={accent} th={th}
        onOpenTask={(taskId, section) => {
          setBellOpen(false);
          const task = tasks.find(t => t.id === taskId);
          if (task) { setSelTask(task); setSheetOpen(true); }
          // Mark as read
          const notif = rawNotifs.find(n => n.task_id === taskId);
          if (notif) setReadIds(prev => new Set([...prev, notif.id]));
          void section; // section scrolling not supported in mobile sheet yet
        }}
      />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
