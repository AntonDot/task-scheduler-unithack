import type { Tag } from '@/types/domain';

interface TagChipProps {
  tag: Tag;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}

export function TagChip({ tag, selected, onClick, onRemove, size = 'sm' }: TagChipProps) {
  const padding = size === 'md' ? '5px 12px' : '3px 10px';
  const fontSize = size === 'md' ? 12.5 : 11;

  const inner = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        maxWidth: '100%',
        background: tag.color + (selected ? '33' : '18'),
        color: tag.color,
        padding,
        borderRadius: 6,
        fontSize,
        fontWeight: 600,
        lineHeight: 1.35,
        border: `1px solid ${selected ? tag.color : tag.color + '44'}`,
        wordBreak: 'break-word',
        whiteSpace: 'normal',
        textAlign: 'left',
      }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{
            background: 'none', border: 'none', padding: 0, margin: 0,
            cursor: 'pointer', color: 'inherit', opacity: 0.65,
            fontSize: fontSize + 2, lineHeight: 1, flexShrink: 0,
          }}
          aria-label="Remove tag"
        >
          ×
        </button>
      )}
    </span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          background: 'none', border: 'none', padding: 0, margin: 0,
          cursor: 'pointer', fontFamily: 'inherit', maxWidth: '100%',
        }}
      >
        {inner}
      </button>
    );
  }

  return inner;
}
