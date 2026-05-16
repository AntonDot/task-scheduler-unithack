import { useState } from 'react';
import type { Tag } from '@/types/domain';
import type { Theme } from '@/theme/theme';
import { TagChip } from './TagChip';
import { IcoX } from '@/components/ui/Icons';

export interface TagsSectionProps {
  projectTags: Tag[];
  selectedTags: Tag[];
  isLead: boolean;
  canEditTags: boolean;
  onToggleTag: (tag: Tag) => void;
  onCreateTag: (name: string, color: string) => Promise<Tag | null>;
  onDeleteTag: (tagId: number) => void;
  theme: Theme;
  accent?: string;
  /** compact = inline picker for create-task flows */
  layout?: 'section' | 'compact';
}

export function TagsSection({
  projectTags,
  selectedTags,
  isLead,
  canEditTags,
  onToggleTag,
  onCreateTag,
  onDeleteTag,
  theme: th,
  accent = '#6366F1',
  layout = 'section',
}: TagsSectionProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6c63ff');
  const [creating, setCreating] = useState(false);

  const selectedIds = new Set(selectedTags.map(t => t.id));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!isLead || !newTagName.trim()) return;
    setCreating(true);
    try {
      const tag = await onCreateTag(newTagName.trim(), newTagColor);
      if (tag) {
        setNewTagName('');
        if (canEditTags && !selectedIds.has(tag.id)) onToggleTag(tag);
      }
    } finally {
      setCreating(false);
    }
  }

  const picker = (
    <>
      {canEditTags && (
        <button
          type="button"
          onClick={() => setMenuOpen(o => !o)}
          style={{
            background: 'none',
            border: `1px dashed ${th.borderHover}`,
            borderRadius: 6,
            color: th.textSecondary,
            padding: layout === 'compact' ? '4px 10px' : '3px 10px',
            fontSize: layout === 'compact' ? 12 : 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          + Add tag
        </button>
      )}
    </>
  );

  const menu = menuOpen && canEditTags && (
    <>
      <div
        onClick={() => setMenuOpen(false)}
        style={{ position: 'fixed', inset: 0, zIndex: 199 }}
        aria-hidden
      />
      <div
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 8,
          background: th.surface,
          border: `1px solid ${th.border}`,
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          zIndex: 200,
          width: 280,
          maxWidth: 'min(280px, calc(100vw - 32px))',
          padding: 14,
          maxHeight: 360,
          overflowY: 'auto',
        }}
      >
        {projectTags.length === 0 && !isLead && (
          <p style={{ fontSize: 12, color: th.textMuted, margin: '0 0 8px' }}>
            No tags in this project yet.
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: isLead ? 12 : 0 }}>
          {projectTags.map(tag => {
            const applied = selectedIds.has(tag.id);
            return (
              <div
                key={tag.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  maxWidth: '100%',
                  background: tag.color + (applied ? '33' : '11'),
                  border: `1px solid ${applied ? tag.color : 'transparent'}`,
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => onToggleTag(tag)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: tag.color, padding: '6px 10px', fontFamily: 'inherit',
                    fontSize: 12, fontWeight: 600, textAlign: 'left',
                    wordBreak: 'break-word', whiteSpace: 'normal',
                  }}
                >
                  {tag.name}
                </button>
                {isLead && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onDeleteTag(tag.id); }}
                    title="Delete tag from project"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: tag.color, padding: '6px 8px', opacity: 0.65, flexShrink: 0,
                    }}
                  >
                    <IcoX size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {isLead && (
          <form
            onSubmit={handleCreate}
            style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              borderTop: projectTags.length ? `1px solid ${th.border}` : 'none',
              paddingTop: projectTags.length ? 12 : 0,
            }}
          >
            <input
              type="text"
              placeholder="Tag name"
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              style={{
                padding: '9px 12px', fontSize: 13, borderRadius: 8,
                border: `1px solid ${th.border}`, background: th.inputBg ?? th.surface,
                color: th.text, outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label
                style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: newTagColor, border: `1px solid ${th.border}`,
                  cursor: 'pointer', position: 'relative', overflow: 'hidden',
                }}
              >
                <input
                  type="color"
                  value={newTagColor}
                  onChange={e => setNewTagColor(e.target.value)}
                  style={{
                    position: 'absolute', inset: -4, opacity: 0, cursor: 'pointer', width: 48, height: 48,
                  }}
                />
              </label>
              <button
                type="submit"
                disabled={creating || !newTagName.trim()}
                style={{
                  flex: 1, padding: '9px 12px', fontSize: 12, fontWeight: 600,
                  background: accent, color: 'white', border: 'none', borderRadius: 8,
                  cursor: creating || !newTagName.trim() ? 'default' : 'pointer',
                  opacity: creating || !newTagName.trim() ? 0.5 : 1,
                }}
              >
                {creating ? 'Creating…' : 'Create tag'}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );

  const chips = (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-start' }}>
        {selectedTags.map(tag => (
          <TagChip
            key={tag.id}
            tag={tag}
            selected
            size={layout === 'compact' ? 'md' : 'sm'}
            onClick={canEditTags ? () => onToggleTag(tag) : undefined}
          />
        ))}
        {picker}
      </div>
      {menu}
    </div>
  );

  if (layout === 'compact') {
    return (
      <div>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: th.textSecondary, display: 'block', marginBottom: 8 }}>
          Tags
        </span>
        {chips}
        {projectTags.length === 0 && !isLead && (
          <p style={{ fontSize: 12, color: th.textMuted, marginTop: 8, fontStyle: 'italic' }}>
            No tags available.
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{
        fontSize: 11, fontWeight: 600, color: th.textMuted,
        letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10,
      }}>
        Tags
      </p>
      {chips}
      {!canEditTags && selectedTags.length === 0 && (
        <p style={{ fontSize: 12, color: th.textMuted, marginTop: 8 }}>No tags</p>
      )}
    </div>
  );
}
