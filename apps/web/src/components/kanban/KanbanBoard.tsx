import { useState } from 'react';
import type { Task } from '@/types/domain';
import type { Theme, DesignColumn } from '@/theme/theme';
import { COLUMNS_DEF, statusToColumn } from '@/theme/theme';
import { KanbanColumn } from './KanbanColumn';
import { TaskDrawer } from './TaskDrawer';
import type { ProjectMember } from '@/api/members';

interface KanbanBoardProps {
  tasks: Task[];
  members: ProjectMember[];
  onStatusChange: (taskId: number, col: DesignColumn) => void;
  onUpdate: (task: Task) => void;
  onAddTask?: (col: DesignColumn) => void;
  accent: string;
  compact: boolean;
  colWidth: number;
  theme: Theme;
}

export function KanbanBoard({
  tasks, members, onStatusChange, onUpdate, onAddTask,
  accent, compact, colWidth, theme,
}: KanbanBoardProps) {
  const [dragOverCol, setDragOverCol] = useState<DesignColumn | null>(null);
  const [selTask, setSelTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function handleDrop(e: React.DragEvent, targetCol: DesignColumn) {
    const taskId = parseInt(e.dataTransfer.getData('taskId'), 10);
    if (!taskId) return;
    onStatusChange(taskId, targetCol);
    setDragOverCol(null);
  }

  function handleTaskClick(task: Task) {
    setSelTask(task);
    setDrawerOpen(true);
  }

  function handleTaskUpdate(updated: Task) {
    onUpdate(updated);
    setSelTask(updated);
  }

  return (
    <>
      <div style={{
        flex: 1, overflowX: 'auto', overflowY: 'hidden',
        padding: '20px 20px 0',
        display: 'flex', alignItems: 'flex-start', gap: 14,
      }}>
        {COLUMNS_DEF.map(col => (
          <KanbanColumn
            key={col.id}
            column={col}
            tasks={tasks.filter(t => statusToColumn(t.status) === col.id)}
            onTaskClick={handleTaskClick}
            onDrop={handleDrop}
            onDragOver={c => setDragOverCol(c)}
            onDragLeave={() => setDragOverCol(null)}
            isDragOver={dragOverCol === col.id}
            accent={accent}
            compact={compact}
            colWidth={colWidth}
            theme={theme}
            onAddTask={onAddTask}
          />
        ))}
      </div>

      <TaskDrawer
        task={selTask}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUpdate={handleTaskUpdate}
        members={members}
        accentColor={accent}
        theme={theme}
      />
    </>
  );
}
