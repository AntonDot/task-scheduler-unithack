import { useState, useEffect, useRef } from 'react';
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

  // Mouse drag state
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Touch drag refs — avoid stale closure by keeping live order in a ref
  const touchActiveIdx = useRef<number | null>(null);
  const draggingCols   = useRef<BoardColumn[]>([]);
  const touchActive    = useRef(false);

  useEffect(() => {
    if (open) setCols([...columns].sort((a, b) => a.order - b.order));
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
    if (!col || col.is_protected) return;
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
    const col = cols[idx];
    if (!col || col.is_protected) return;
    const newCols = [...cols];
    newCols[idx] = { ...col, name };
    setCols(newCols);
  }

  function handleDelete(id: number) {
    const col = cols.find(c => c.id === id);
    if (col?.is_protected) return;
    if (cols.filter(c => !c.is_protected).length <= 1) return;
    if (confirm('Delete this column? Tasks will be moved to the first column.')) {
      deleteMut.mutate(id);
    }
  }

  // ─── Mouse drag ──────────────────────────────────────────────────────────────

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

  // ─── Touch drag (handle-only, ref-based to avoid stale closure) ──────────────

  function handleHandleTouchStart(e: React.TouchEvent, idx: number) {
    e.stopPropagation();
    touchActiveIdx.current = idx;
    draggingCols.current = [...cols];
    touchActive.current = true;
    (e.currentTarget.closest('[data-col-idx]') as HTMLElement | null)?.style.setProperty('opacity', '0.5');
  }

  function handleHandleTouchMove(e: React.TouchEvent) {
    if (!touchActive.current) return;
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    if (!touch) return;

    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const row = el?.closest('[data-col-idx]') as HTMLElement | null;
    if (!row) return;

    const targetIdx = parseInt(row.dataset.colIdx ?? '-1');
    if (targetIdx === -1 || targetIdx === touchActiveIdx.current) return;

    const fromIdx = touchActiveIdx.current!;
    const newCols = [...draggingCols.current];
    const dragged = newCols[fromIdx];
    if (!dragged) return;
    newCols.splice(fromIdx, 1);
    newCols.splice(targetIdx, 0, dragged);

    // Update both the live ref AND React state
    draggingCols.current = newCols;
    setCols(newCols);
    touchActiveIdx.current = targetIdx;
  }

  function handleHandleTouchEnd(e: React.TouchEvent) {
    if (!touchActive.current) return;
    touchActive.current = false;
    (e.currentTarget.closest('[data-col-idx]') as HTMLElement | null)?.style.setProperty('opacity', '1');
    touchActiveIdx.current = null;
    // Use the ref — React state may not have flushed yet
    reorderMut.mutate(draggingCols.current.map(c => c.id));
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
        /* CSS min() — works natively, no JS needed */
        width: 'min(500px, calc(100vw - 32px))',
        maxHeight: '85vh', background: th.surface, borderRadius: 16,
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)', zIndex: 110,
        display: 'flex', flexDirection: 'column',
        boxSizing: 'border-box',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${th.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: th.text }}>Manage Columns</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, padding: 4, display: 'flex' }}>
            <IcoX size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 14px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cols.map((col, idx) => (
              <div
                key={col.id}
                data-col-idx={idx}
                draggable
                onDragStart={e => handleDragStart(e, idx)}
                onDragOver={e => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px',
                  background: th.bg, border: `1px solid ${th.border}`, borderRadius: 10,
                  opacity: draggedIdx === idx ? 0.5 : 1,
                  touchAction: 'none',
                }}
              >
                {/* Drag handle — touch events live here only */}
                <div
                  style={{ color: th.textMuted, flexShrink: 0, cursor: 'grab', padding: '2px 4px', touchAction: 'none' }}
                  onTouchStart={e => handleHandleTouchStart(e, idx)}
                  onTouchMove={handleHandleTouchMove}
                  onTouchEnd={handleHandleTouchEnd}
                >
                  <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor">
                    <circle cx="4" cy="3"  r="1.5"/><circle cx="4" cy="9"  r="1.5"/><circle cx="4" cy="15" r="1.5"/>
                    <circle cx="8" cy="3"  r="1.5"/><circle cx="8" cy="9"  r="1.5"/><circle cx="8" cy="15" r="1.5"/>
                  </svg>
                </div>

                {/* Color picker */}
                <input
                  type="color"
                  value={col.color}
                  onChange={e => handleColorChange(idx, e.target.value)}
                  title="Column color"
                  style={{ width: 24, height: 24, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none', flexShrink: 0 }}
                />

                {/* Name input — readOnly for protected columns */}
                <input
                  value={col.name}
                  readOnly={!!col.is_protected}
                  onChange={e => handleNameChange(idx, e.target.value)}
                  onBlur={() => handleNameBlur(idx)}
                  title={col.is_protected ? 'Protected column name cannot be changed' : undefined}
                  style={{
                    flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 6,
                    border: '1px solid transparent',
                    background: col.is_protected ? 'transparent' : 'transparent',
                    color: th.text, fontSize: 13.5, fontWeight: 600, outline: 'none',
                    cursor: col.is_protected ? 'default' : 'text',
                    opacity: col.is_protected ? 0.7 : 1,
                  }}
                  onFocus={e => { if (!col.is_protected) e.target.style.border = `1px solid ${accent}`; }}
                  onBlurCapture={e => { e.target.style.border = '1px solid transparent'; }}
                />

                {/* Lock icon */}
                {col.is_protected && (
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: th.textMuted, flexShrink: 0 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                )}

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(col.id)}
                  disabled={col.is_protected || cols.length <= 1}
                  title={col.is_protected ? 'Protected column' : 'Delete column'}
                  style={{
                    background: 'none', border: 'none', color: '#EF4444', padding: 3,
                    opacity: col.is_protected ? 0.2 : cols.length > 1 ? 1 : 0.3,
                    cursor: col.is_protected ? 'not-allowed' : 'pointer',
                    flexShrink: 0, display: 'flex',
                  }}
                >
                  <IcoX size={15} />
                </button>
              </div>
            ))}
          </div>

          <button onClick={handleAdd} style={{
            marginTop: 12, width: '100%', padding: '11px', borderRadius: 10,
            border: `1px dashed ${accent}`, background: accent + '11', color: accent,
            fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            boxSizing: 'border-box',
          }}>
            <IcoPlus size={15} /> Add Column
          </button>
        </div>
      </div>
    </>
  );
}
