import type { Tag } from '@/types/domain';
import { TagChip } from './TagChip';

/** Read-only tag row for kanban cards */
export function TaskTagList({ tags }: { tags?: Tag[] }) {
  if (!tags?.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      {tags.map(tag => (
        <TagChip key={tag.id} tag={tag} size="sm" />
      ))}
    </div>
  );
}
