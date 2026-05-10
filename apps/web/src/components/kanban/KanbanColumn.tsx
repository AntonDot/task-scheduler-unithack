import type { Task } from '@/types/domain';
import type { Theme, DesignColumn } from '@/theme/theme';
import { TaskCard } from './TaskCard';
import { IcoPlus } from '@/components/ui/Icons';

interface KanbanColumnProps {
  column: { id: DesignColumn; label: string; dotColor: string };
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onDrop: (e: React.DragEvent, colId: DesignColumn) => void;
  onDragOver: (colId: DesignColumn) => void;
  onDragLeave: () => void;
  isDragOver: boolean;
  accent: string;
  compact: boolean;
  colWidth: number;
  theme: Theme;
  onAddTask?: () => void;
}

export function KanbanColumn({
  column, tasks, onTaskClick, onDrop, onDragOver, onDragLeave,
  isDragOver, accent, compact, colWidth, theme, onAddTask,
}: KanbanColumnProps) {
  const th = theme;

  function handleDragStart(e: React.DragEvent, taskId: number) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('taskId', String(taskId));
  }

  return (
    <div
      data-testid={`column-${column.id}`}
      onDragOver={e => { e.preventDefault(); onDragOver(column.id); }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop(e, column.id); }}
      style={{
        width: colWidth, minWidth: colWidth,
        background: isDragOver ? accent + '10' : th.columnBg,
        borderRadius: 14, padding: '14px 12px',
        display: 'flex', flexDirection: 'column',
        border: `2px dashed ${isDragOver ? accent : 'transparent'}`,
        transition: 'background 0.15s, border-color 0.15s',
        maxHeight: '100%',
      }}
    >
      {/* Column header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: column.dotColor }} />
          <span style={{ fontSize: 11.5, fontWeight: 700, color: th.textSecondary, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {column.label}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: tasks.length > 0 ? column.dotColor : th.textMuted,
            background: tasks.length > 0 ? column.dotColor + '18' : th.border,
            padding: '1px 7px', borderRadius: 20, minWidth: 20, textAlign: 'center',
          }}>
            {tasks.length}
          </span>
        </div>
        <button
          onClick={onAddTask}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: th.textMuted, padding: 2, borderRadius: 5, display: 'flex',
            transition: 'color 0.1s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = th.text)}
          onMouseLeave={e => (e.currentTarget.style.color = th.textMuted)}
        >
          <IcoPlus size={14} />
        </button>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1, paddingBottom: 4 }}>
        {tasks.map(task => (
          <div key={task.id} style={{ animation: 'fadeIn 0.15s ease' }}>
            <TaskCard
              task={task}
              onSelect={onTaskClick}
              onDragStart={handleDragStart}
              compact={compact}
              theme={theme}
            />
          </div>
        ))}
        {tasks.length === 0 && !isDragOver && (
          <div style={{ padding: '20px 10px', textAlign: 'center', color: th.textMuted, fontSize: 12.5 }}>
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
}
