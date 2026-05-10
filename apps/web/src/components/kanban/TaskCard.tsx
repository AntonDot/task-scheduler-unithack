import { useState } from 'react';
import type { Task } from '@/types/domain';
import { getUrgencyMap, formatDeadline, isOverdue, apiUrgencyToDesign, createTheme } from '@/theme/theme';
import type { Theme } from '@/theme/theme';
import { Avatar } from './Avatar';
import { IcoChat, IcoClip } from '@/components/ui/Icons';

interface TaskCardProps {
  task: Task;
  onSelect: (task: Task) => void;
  onDragStart?: (e: React.DragEvent, taskId: number) => void;
  onDragEnd?: () => void;
  compact?: boolean;
  theme?: Theme;
}

const DEFAULT_URGENCY = { label: 'Medium', color: '#4338CA', bg: '#EEF2FF', border: '#6366F1' };

export function TaskCard({ task, onSelect, onDragStart, onDragEnd, compact = false, theme }: TaskCardProps) {
  const [hovered, setHovered] = useState(false);
  const th = theme ?? createTheme(false);

  const urgKey = apiUrgencyToDesign(task.urgency);
  const urgMap = getUrgencyMap(th.dark);
  const urgency = urgMap[urgKey] ?? DEFAULT_URGENCY;

  const overdue = isOverdue(task.deadline, undefined);
  const deadlineStr = formatDeadline(task.deadline);



  const commentCount = 0; // comments not on task object directly
  const attachCount  = 0;

  return (
    <div
      data-testid={`task-card-${task.id}`}
      draggable
      onDragStart={e => onDragStart?.(e, task.id)}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(task)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: th.surface,
        borderTop:    `1px solid ${hovered ? th.borderHover : th.border}`,
        borderRight:  `1px solid ${hovered ? th.borderHover : th.border}`,
        borderBottom: `1px solid ${hovered ? th.borderHover : th.border}`,
        borderLeft:   `4px solid ${urgency.border}`,
        borderRadius: 12,
        padding: compact ? '10px 12px' : '13px 14px',
        cursor: 'pointer',
        transition: 'box-shadow 0.12s ease, transform 0.12s ease',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.08)' : '0 1px 2px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        userSelect: 'none',
      }}
    >
      {/* Title */}
      <p style={{
        fontSize: 13.5, fontWeight: 500, color: th.text,
        lineHeight: 1.45, marginBottom: compact ? 8 : 10,
        display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {task.title}
      </p>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Avatar user={task.assignee} size={22} />
          {task.deadline && (
            <span style={{
              fontSize: 11, fontWeight: 500,
              color: overdue ? '#991B1B' : th.textSecondary,
              background: overdue ? '#FEF2F2' : 'transparent',
              padding: overdue ? '1px 5px' : 0, borderRadius: 4,
            }}>
              {deadlineStr}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {commentCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: th.textMuted, fontSize: 10.5 }}>
              <IcoChat size={11} />{commentCount}
            </span>
          )}
          {attachCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: th.textMuted, fontSize: 10.5 }}>
              <IcoClip size={11} />{attachCount}
            </span>
          )}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 8px', borderRadius: 6,
            background: urgency.bg, color: urgency.color,
            fontSize: 10.5, fontWeight: 600, flexShrink: 0,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: urgency.border }} />
            {urgency.label}
          </span>
        </div>
      </div>
    </div>
  );
}
