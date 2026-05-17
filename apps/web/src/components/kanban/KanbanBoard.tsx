import { useState, useEffect } from 'react';
import type { Task, BoardColumn } from '@/types/domain';
import type { Theme } from '@/theme/theme';
import { KanbanColumn } from './KanbanColumn';
import { TaskDrawer } from './TaskDrawer';
import type { ProjectMember } from '@/api/members';

interface KanbanBoardProps {
  tasks: Task[];
  columns: BoardColumn[];
  members: ProjectMember[];
  onColumnChange: (taskId: number, colId: number) => void;
  onUpdate: (task: Task) => void;
  onDelete?: (taskId: number) => void;
  onAddTask?: (colId: number) => void;
  accent: string;
  compact: boolean;
  colWidth: number;
  theme: Theme;
  openTaskId?: number | null;
  openTaskSection?: 'comments' | 'description';
  onTaskOpened?: () => void;
}

export function KanbanBoard({
  tasks, columns, members, onColumnChange, onUpdate, onDelete, onAddTask,
  accent, compact, colWidth, theme,
  openTaskId, openTaskSection, onTaskOpened,
}: KanbanBoardProps) {
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);
  const [selTask, setSelTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSection, setDrawerSection] = useState<'comments' | 'description' | undefined>(undefined);

  useEffect(() => {
    if (openTaskId != null) {
      const task = tasks.find(t => t.id === openTaskId);
      if (task) {
        setSelTask(task);
        setDrawerSection(openTaskSection);
        setDrawerOpen(true);
        onTaskOpened?.();
      }
    }
  }, [openTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDrop(e: React.DragEvent, targetColId: number) {
    const taskId = parseInt(e.dataTransfer.getData('taskId'), 10);
    if (!taskId) return;
    onColumnChange(taskId, targetColId);
    setDragOverCol(null);
  }

  function handleTaskClick(task: Task) {
    setSelTask(task);
    setDrawerSection(undefined);
    setDrawerOpen(true);
  }

  function handleTaskUpdate(updated: Task) {
    onUpdate(updated);
    setSelTask(updated);
  }

  return (
    <>
      <div dir="ltr" style={{
        flex: 1, overflowX: 'auto', overflowY: 'hidden',
        padding: '20px 20px 0',
        display: 'flex', alignItems: 'flex-start', gap: 14,
      }}>
        {columns.map(col => (
          <KanbanColumn
            key={col.id}
            column={col}
            tasks={tasks.filter(t => t.column_id === col.id)}
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
        columns={columns}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerSection(undefined); }}
        onUpdate={handleTaskUpdate}
        onDelete={onDelete}
        members={members}
        accentColor={accent}
        theme={theme}
        scrollToSection={drawerSection}
      />
    </>
  );
}
