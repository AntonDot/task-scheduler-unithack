import { useState, useEffect, useCallback } from 'react';
import type { Theme } from '@/theme/theme';
import { getUrgencyMap } from '@/theme/theme';
import { DatePicker } from '@/components/ui/DatePicker';
import { IcoX } from '@/components/ui/Icons';
import type { Project, Tag, BoardColumn } from '@/types/domain';
import type { ProjectMember } from '@/api/members';
import { fetchProjectTags, createTag, deleteTag } from '@/api/tags';
import { TagsSection } from '@/components/tags/TagsSection';

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (body: { title: string; description?: string; assignee_id?: number; urgency?: string; deadline?: string; column_id?: number; tag_ids?: number[] }) => void;
  loading?: boolean;
  members: ProjectMember[];
  columns: BoardColumn[];
  project?: Project | null;
  isLead?: boolean;
  accentColor?: string;
  theme: Theme;
  initialColumn?: number | null;
}

export function CreateTaskModal({ open, onClose, onCreate, loading, members, columns, project, isLead = false, accentColor = '#6366F1', theme, initialColumn }: CreateTaskModalProps) {
  const [form, setForm] = useState<{ title: string; urgency: string; assignee_id: number | ''; deadline: string; column_id: number | ''; tag_ids: number[] }>({ title: '', urgency: 'medium', assignee_id: '', deadline: '', column_id: initialColumn ?? (columns[0]?.id || ''), tag_ids: [] });
  const [projectTags, setProjectTags] = useState<Tag[]>([]);

  useEffect(() => {
    if (open) {
      setForm(f => ({ ...f, column_id: initialColumn ?? (columns[0]?.id || ''), title: '', tag_ids: [] }));
      if (project?.id) {
        fetchProjectTags(project.id).then(setProjectTags).catch(() => setProjectTags([]));
      }
    }
  }, [open, initialColumn, columns, project?.id]);

  const th  = theme;
  const acc = accentColor;

  const selectedTags = projectTags.filter(t => form.tag_ids.includes(t.id));

  const toggleTag = useCallback((tag: Tag) => {
    setForm(f => {
      const has = f.tag_ids.includes(tag.id);
      const tag_ids = has ? f.tag_ids.filter(id => id !== tag.id) : [...f.tag_ids, tag.id];
      return { ...f, tag_ids };
    });
  }, []);

  const handleCreateTag = useCallback(async (name: string, color: string): Promise<Tag | null> => {
    if (!isLead || !project?.id) return null;
    try {
      const tag = await createTag(project.id, { name, color });
      setProjectTags(prev => [...prev, tag]);
      return tag;
    } catch {
      return null;
    }
  }, [isLead, project?.id]);

  const handleDeleteTag = useCallback(async (tagId: number) => {
    if (!isLead) return;
    try {
      await deleteTag(tagId);
      setProjectTags(prev => prev.filter(t => t.id !== tagId));
      setForm(f => ({ ...f, tag_ids: f.tag_ids.filter(id => id !== tagId) }));
    } catch {}
  }, [isLead]);

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
      column_id: form.column_id !== '' ? Number(form.column_id) : undefined,
      tag_ids: form.tag_ids.length ? form.tag_ids : undefined,
    });
    setForm({ title: '', urgency: 'medium', assignee_id: '', deadline: '', column_id: columns[0]?.id || '', tag_ids: [] });
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
              <select value={form.column_id} onChange={e => setForm({ ...form, column_id: e.target.value ? Number(e.target.value) : '' })} style={sel}>
                {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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

          <TagsSection
            projectTags={projectTags}
            selectedTags={selectedTags}
            isLead={isLead}
            canEditTags
            onToggleTag={toggleTag}
            onCreateTag={handleCreateTag}
            onDeleteTag={handleDeleteTag}
            theme={th}
            accent={acc}
            layout="compact"
          />
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
