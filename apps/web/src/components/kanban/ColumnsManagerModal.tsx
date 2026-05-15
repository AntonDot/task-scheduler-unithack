import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardColumn } from '@/types/domain';
import { createColumn, updateColumn, deleteColumn, reorderColumns } from '@/api/columns';
import { IcoX, IcoPlus } from '@/components/ui/Icons';
import type { Theme } from '@/theme/theme';

interface ColumnsManagerModalProps {
  open: boolean;
  onClose: () => void;
  projectId: number;
  columns: BoardColumn[];
  theme: Theme;
  accent: string;
}

export function ColumnsManagerModal({ open, onClose, projectId, columns, theme: th, accent }: ColumnsManagerModalProps) {
  const queryClient = useQueryClient();
  const [cols, setCols] = useState<BoardColumn[]>([]);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  useEffect(() => {
    // Only sync local state when modal first opens, not on background refetches
    if (open) {
      setCols([...columns].sort((a, b) => a.order - b.order));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['columns', projectId] });
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['columns', projectId] });
    queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
  };

  const createMut = useMutation({
    mutationFn: (body: { name: string; color: string }) => createColumn(projectId, body),
    onSuccess: () => {
      // After creating, refetch and update local state
      queryClient.invalidateQueries({ queryKey: ['columns', projectId] }).then(() => {
        const fresh = queryClient.getQueryData<BoardColumn[]>(['columns', projectId]);
        if (fresh) setCols([...fresh].sort((a, b) => a.order - b.order));
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { name: string; color: string } }) => updateColumn(projectId, id, body),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteColumn(projectId, id),
    onSuccess: () => {
      invalidateAll();
      // Update local state to match what was deleted
      queryClient.invalidateQueries({ queryKey: ['columns', projectId] }).then(() => {
        const fresh = queryClient.getQueryData<BoardColumn[]>(['columns', projectId]);
        if (fresh) setCols([...fresh].sort((a, b) => a.order - b.order));
      });
    },
  });

  const reorderMut = useMutation({
    mutationFn: (orderedIds: number[]) => reorderColumns(projectId, orderedIds),
    onSuccess: invalidate,
  });

  function handleAdd() {
    createMut.mutate({ name: 'New Column', color: '#9CA3AF' });
  }

  function handleNameBlur(idx: number) {
    const col = cols[idx];
    if (!col) return;
    updateMut.mutate({ id: col.id, body: { name: col.name, color: col.color } });
  }

  function handleColorChange(idx: number, color: string) {
    const newCols = [...cols];
    const col = newCols[idx];
    if (!col) return;
    newCols[idx] = { ...col, color };
    setCols(newCols);
    updateMut.mutate({ id: col.id, body: { name: col.name, color } });
  }

  function handleNameChange(idx: number, name: string) {
    const newCols = [...cols];
    const col = newCols[idx];
    if (!col) return;
    newCols[idx] = { ...col, name };
    setCols(newCols);
  }

  function handleDelete(id: number) {
    if (cols.length <= 1) return;
    if (confirm('Delete this column? Tasks in it will still exist but won\'t be visible until moved.')) {
      deleteMut.mutate(id);
    }
  }

  function handleDragStart(e: React.DragEvent, idx: number) {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;
    const newCols = [...cols];
    const dragged = newCols[draggedIdx];
    if (!dragged) return;
    newCols.splice(draggedIdx, 1);
    newCols.splice(idx, 0, dragged);
    setDraggedIdx(idx);
    setCols(newCols);
  }

  function handleDragEnd() {
    setDraggedIdx(null);
    reorderMut.mutate(cols.map(c => c.id));
  }

  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.3)',
        zIndex: 100, backdropFilter: 'blur(2px)',
      }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 500, maxHeight: '85vh', background: th.surface, borderRadius: 16,
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)', zIndex: 110,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${th.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: th.text }}>Manage Columns</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted }}>
            <IcoX size={20} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cols.map((col, idx) => (
              <div
                key={col.id}
                draggable
                onDragStart={e => handleDragStart(e, idx)}
                onDragOver={e => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  background: th.bg, border: `1px solid ${th.border}`, borderRadius: 10,
                  opacity: draggedIdx === idx ? 0.5 : 1,
                  cursor: 'grab',
                }}
              >
                {/* Drag handle */}
                <div style={{ color: th.textMuted, flexShrink: 0 }}>
                  <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor">
                    <circle cx="5" cy="4" r="1.5"/><circle cx="5" cy="10" r="1.5"/><circle cx="5" cy="16" r="1.5"/>
                    <circle cx="9" cy="4" r="1.5"/><circle cx="9" cy="10" r="1.5"/><circle cx="9" cy="16" r="1.5"/>
                  </svg>
                </div>

                {/* Color picker */}
                <input
                  type="color"
                  value={col.color}
                  onChange={e => handleColorChange(idx, e.target.value)}
                  title="Column color"
                  style={{
                    width: 26, height: 26, padding: 0, border: 'none',
                    borderRadius: 4, cursor: 'pointer', background: 'none',
                  }}
                />

                {/* Name input */}
                <input
                  value={col.name}
                  onChange={e => handleNameChange(idx, e.target.value)}
                  onBlur={() => handleNameBlur(idx)}
                  style={{
                    flex: 1, padding: '6px 10px', borderRadius: 6,
                    border: `1px solid transparent`, background: 'transparent',
                    color: th.text, fontSize: 14, fontWeight: 600, outline: 'none',
                  }}
                  onFocus={e => (e.target.style.border = `1px solid ${accent}`)}
                />

                {/* Delete */}
                <button
                  onClick={() => handleDelete(col.id)}
                  disabled={cols.length <= 1}
                  style={{
                    background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 4,
                    opacity: cols.length > 1 ? 1 : 0.3,
                  }}
                >
                  <IcoX size={16} />
                </button>
              </div>
            ))}
          </div>

          <button onClick={handleAdd} style={{
            marginTop: 16, width: '100%', padding: '12px', borderRadius: 10,
            border: `1px dashed ${accent}`, background: accent + '11', color: accent,
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <IcoPlus size={16} /> Add Column
          </button>
        </div>
      </div>
    </>
  );
}
