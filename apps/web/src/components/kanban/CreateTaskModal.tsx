import { useState, useEffect } from 'react';
import type { Theme, DesignColumn } from '@/theme/theme';
import { getUrgencyMap, COLUMNS_DEF, columnToStatus } from '@/theme/theme';
import { DatePicker } from '@/components/ui/DatePicker';
import { IcoX } from '@/components/ui/Icons';
import type { Project } from '@/types/domain';
import type { ProjectMember } from '@/api/members';

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (body: { title: string; description?: string; assignee_id?: number; urgency?: string; deadline?: string; status?: string }) => void;
  loading?: boolean;
  members: ProjectMember[];
  project?: Project | null;
  accentColor?: string;
  theme: Theme;
  initialColumn?: DesignColumn;
}

export function CreateTaskModal({ open, onClose, onCreate, loading, members, accentColor = '#6366F1', theme, initialColumn }: CreateTaskModalProps) {
  const [form, setForm] = useState({ title: '', urgency: 'medium', assignee_id: '' as number | '', deadline: '', column: (initialColumn ?? 'backlog') as DesignColumn });

  useEffect(() => {
    if (open) setForm(f => ({ ...f, column: initialColumn ?? 'backlog' }));
  }, [open, initialColumn]);
  const th  = theme;
  const acc = accentColor;

  const sel: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: `1px solid ${th.border}`,
    fontSize: 13, color: th.text, background: th.surface, outline: 'none',
    cursor: 'pointer', width: '100%', fontFamily: 'inherit', boxSizing: 'border-box',
  };

  function handleCreate() {
    if (!form.title.trim()) return;
    onCreate({
      title: form.title.trim(),
      urgency: form.urgency.toUpperCase(),
      assignee_id: form.assignee_id !== '' ? Number(form.assignee_id) : undefined,
      deadline: form.deadline || undefined,
      status: columnToStatus(form.column),
    });
    setForm({ title: '', urgency: 'medium', assignee_id: '', deadline: '', column: 'backlog' });
  }

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.22)',
        zIndex: 60, opacity: open ? 1 : 0, transition: 'opacity 0.15s',
        pointerEvents: open ? 'auto' : 'none',
      }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: open ? 'translate(-50%,-50%) scale(1)' : 'translate(-50%,-50%) scale(0.95)',
        width: 480, background: th.surface, borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        zIndex: 70, padding: '24px',
        transition: 'transform 0.15s ease, opacity 0.15s',
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 700, color: th.text }}>Create task</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, padding: 4, borderRadius: 6, display: 'flex' }}>
            <IcoX size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: th.textSecondary, display: 'block', marginBottom: 5 }}>Task title *</label>
            <input
              autoFocus value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="What needs to be done?"
              style={{ ...sel, padding: '10px 14px', fontSize: 14 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: th.textSecondary, display: 'block', marginBottom: 5 }}>Column</label>
              <select value={form.column} onChange={e => setForm({ ...form, column: e.target.value as DesignColumn })} style={sel}>
                {COLUMNS_DEF.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: th.textSecondary, display: 'block', marginBottom: 5 }}>Urgency</label>
              <select value={form.urgency} onChange={e => setForm({ ...form, urgency: e.target.value })} style={sel}>
                {Object.entries(getUrgencyMap(theme.dark)).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: th.textSecondary, display: 'block', marginBottom: 5 }}>Assignee</label>
              <select value={form.assignee_id} onChange={e => setForm({ ...form, assignee_id: e.target.value ? Number(e.target.value) : '' })} style={sel}>
                <option value="">Unassigned</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: th.textSecondary, display: 'block', marginBottom: 5 }}>Deadline</label>
            <DatePicker value={form.deadline || null} onChange={v => setForm({ ...form, deadline: v })} accent={acc} theme={th} placeholder="Pick a date" />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: 9, border: `1px solid ${th.border}`,
            background: 'none', fontSize: 13.5, fontWeight: 500, color: th.textSecondary,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button onClick={handleCreate} disabled={!form.title.trim() || loading} style={{
            padding: '9px 20px', borderRadius: 9, border: 'none',
            background: form.title.trim() ? acc : th.border,
            color: form.title.trim() ? 'white' : th.textMuted,
            fontSize: 13.5, fontWeight: 600,
            cursor: form.title.trim() ? 'pointer' : 'not-allowed',
            boxShadow: form.title.trim() ? `0 2px 8px ${acc}44` : 'none',
            transition: 'all 0.15s', fontFamily: 'inherit',
          }}>{loading ? 'Creating…' : 'Create task'}</button>
        </div>
      </div>
    </>
  );
}
