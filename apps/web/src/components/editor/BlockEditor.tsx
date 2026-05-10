import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Theme } from '@/theme/theme';

// ─── Block types ─────────────────────────────────────────────────────────────

type BlockType = 'paragraph'|'h1'|'h2'|'h3'|'bullet'|'numbered'|'todo'|'quote'|'code'|'divider';

interface Block {
  id: string;
  type: BlockType;
  text: string;
  checked: boolean;
}

const BLOCK_COMMANDS = [
  { type: 'paragraph' as BlockType, icon: 'T',   label: 'Text',          desc: 'Plain text paragraph' },
  { type: 'h1'        as BlockType, icon: 'H1',  label: 'Heading 1',     desc: 'Big section heading' },
  { type: 'h2'        as BlockType, icon: 'H2',  label: 'Heading 2',     desc: 'Medium heading' },
  { type: 'h3'        as BlockType, icon: 'H3',  label: 'Heading 3',     desc: 'Small heading' },
  { type: 'bullet'    as BlockType, icon: '•',   label: 'Bulleted list',  desc: 'Unordered list item' },
  { type: 'numbered'  as BlockType, icon: '1.',  label: 'Numbered list', desc: 'Ordered list item' },
  { type: 'todo'      as BlockType, icon: '☐',   label: 'To-do',         desc: 'Task with checkbox' },
  { type: 'quote'     as BlockType, icon: '"',   label: 'Quote',         desc: 'Callout blockquote' },
  { type: 'code'      as BlockType, icon: '</>', label: 'Code',          desc: 'Inline code block' },
  { type: 'divider'   as BlockType, icon: '—',   label: 'Divider',       desc: 'Horizontal separator' },
];

function makeBlock(type: BlockType = 'paragraph', text = ''): Block {
  return { id: 'b' + Date.now() + Math.random().toString(36).slice(2), type, text, checked: false };
}

function textToBlocks(text: string): Block[] {
  if (!text || !text.trim()) return [makeBlock('paragraph', '')];
  return text.split('\n').map(line => {
    if (line === '---')             return makeBlock('divider', '');
    if (line.startsWith('# '))     return makeBlock('h1', line.slice(2));
    if (line.startsWith('## '))    return makeBlock('h2', line.slice(3));
    if (line.startsWith('### '))   return makeBlock('h3', line.slice(4));
    if (line.startsWith('> '))     return makeBlock('quote', line.slice(2));
    if (line.startsWith('- [x] ')) return { ...makeBlock('todo', line.slice(6)), checked: true };
    if (line.startsWith('- [ ] ')) return { ...makeBlock('todo', line.slice(6)), checked: false };
    if (line.startsWith('- '))     return makeBlock('bullet', line.slice(2));
    if (/^\d+\. /.test(line))      return makeBlock('numbered', line.replace(/^\d+\. /, ''));
    return makeBlock('paragraph', line);
  });
}

function blocksToText(blocks: Block[]): string {
  return blocks.map(b => {
    switch (b.type) {
      case 'divider':  return '---';
      case 'h1':       return '# ' + b.text;
      case 'h2':       return '## ' + b.text;
      case 'h3':       return '### ' + b.text;
      case 'quote':    return '> ' + b.text;
      case 'todo':     return `- ${b.checked ? '[x]' : '[ ]'} ${b.text}`;
      case 'bullet':   return '- ' + b.text;
      default:         return b.text;
    }
  }).join('\n');
}

// ─── BlockEditor component ────────────────────────────────────────────────────

interface BlockEditorProps {
  value: string;
  onChange: (text: string) => void;
  accent?: string;
  theme?: Theme;
  readonly?: boolean;
}

export function BlockEditor({ value, onChange, accent = '#6366F1', theme, readonly }: BlockEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>(() => textToBlocks(value));
  const [slashMenu, setSlashMenu] = useState<{ blockId: string; filter: string; y: number; x: number } | null>(null);

  React.useEffect(() => {
    const currentText = blocksToText(blocks);
    if (value !== currentText) {
      setBlocks(textToBlocks(value));
    }
  }, [value]);

  const [menuIdx, setMenuIdx] = useState(0);
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const surf = theme?.surface || '#fff';
  const bord = theme?.border  || '#E5E7EB';
  const txt  = theme?.text    || '#111827';
  const txt2 = theme?.textSecondary || '#6B7280';
  const txtM = theme?.textMuted     || '#9CA3AF';
  const col  = theme?.columnBg      || '#F3F4F6';
  const codeB= theme?.codeBlock     || '#F3F4F6';

  const filteredCmds = slashMenu
    ? BLOCK_COMMANDS.filter(c => {
        if (!slashMenu.filter) return true;
        const f = slashMenu.filter.toLowerCase();
        return c.label.toLowerCase().includes(f) || c.type.toLowerCase().includes(f);
      })
    : [];

  const commit = useCallback((updated: Block[]) => {
    setBlocks(updated);
    onChange(blocksToText(updated));
  }, [onChange]);

  function upd(id: string, changes: Partial<Block>) {
    commit(blocks.map(b => b.id === id ? { ...b, ...changes } : b));
  }

  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  function insertAfter(id: string, type: BlockType = 'paragraph') {
    const idx = blocks.findIndex(b => b.id === id);
    const nb = makeBlock(type);
    const next = [...blocks];
    next.splice(idx + 1, 0, nb);
    commit(next);
    setTimeout(() => { const el = refs.current[nb.id]; if (el) { el.focus(); autoGrow(el); } }, 20);
  }

  function deleteBlock(id: string) {
    if (blocks.length <= 1) { upd(id, { type: 'paragraph', text: '' }); return; }
    const idx = blocks.findIndex(b => b.id === id);
    const prev = blocks[idx - 1];
    commit(blocks.filter(b => b.id !== id));
    if (prev) setTimeout(() => refs.current[prev.id]?.focus(), 20);
  }

  function applyCmd(cmd: typeof BLOCK_COMMANDS[0], blockId: string) {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    const cleaned = block.text.replace(/\/\S*$/, '').trimEnd();
    upd(blockId, cmd.type === 'divider' ? { type: 'divider', text: '' } : { type: cmd.type, text: cleaned });
    setSlashMenu(null);
    setTimeout(() => refs.current[blockId]?.focus(), 20);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, block: Block) {
    if (readonly) return;
    if (slashMenu && filteredCmds.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMenuIdx(i => Math.min(i+1, filteredCmds.length-1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMenuIdx(i => Math.max(i-1, 0)); return; }
      if (e.key === 'Enter')     { e.preventDefault(); const c = filteredCmds[menuIdx]; if (c) applyCmd(c, block.id); return; }
      if (e.key === 'Escape')    { setSlashMenu(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const continueType = ['bullet','numbered','todo'].includes(block.type) && block.text ? block.type as BlockType : 'paragraph';
      insertAfter(block.id, continueType);
      return;
    }
    if (e.key === 'Backspace' && !block.text) {
      e.preventDefault();
      if (block.type !== 'paragraph') { upd(block.id, { type: 'paragraph' }); return; }
      deleteBlock(block.id);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>, block: Block) {
    if (readonly) return;
    const text = e.target.value;
    autoGrow(e.target);
    upd(block.id, { text });
    const si = text.lastIndexOf('/');
    if (si >= 0 && (si === 0 || text[si-1] === ' ') && !text.slice(si).includes(' ')) {
      const rect = e.target.getBoundingClientRect();
      setSlashMenu({ blockId: block.id, filter: text.slice(si+1), y: rect.bottom + 6, x: rect.left });
      setMenuIdx(0);
    } else if (slashMenu) {
      setSlashMenu(null);
    }
  }

  function getTextareaStyle(type: BlockType, checked: boolean): React.CSSProperties {
    const base: React.CSSProperties = {
      width: '100%', border: 'none', outline: 'none', resize: 'none',
      fontFamily: 'Inter, sans-serif', background: 'transparent',
      padding: 0, margin: 0, lineHeight: 1.65, overflow: 'hidden',
      color: txt,
    };
    if (type === 'h1') return { ...base, fontSize: 22, fontWeight: 700, lineHeight: 1.3 };
    if (type === 'h2') return { ...base, fontSize: 18, fontWeight: 600, lineHeight: 1.35 };
    if (type === 'h3') return { ...base, fontSize: 15, fontWeight: 600 };
    if (type === 'quote') return { ...base, fontSize: 14, fontStyle: 'italic', color: txt2 };
    if (type === 'code') return { ...base, fontSize: 12.5, fontFamily: 'ui-monospace, Consolas, monospace' };
    if (type === 'todo') return { ...base, fontSize: 14, color: checked ? txtM : txt, textDecoration: checked ? 'line-through' : 'none' };
    return { ...base, fontSize: 14 };
  }

  function renderBlock(block: Block, idx: number) {
    if (block.type === 'divider') {
      return (
        <div key={block.id} style={{ padding: '10px 0' }}>
          <hr style={{ border: 'none', borderTop: `1.5px solid ${bord}`, margin: 0 }} />
        </div>
      );
    }
    const isCode  = block.type === 'code';
    const isQuote = block.type === 'quote';
    const isHead  = ['h1','h2','h3'].includes(block.type);
    const wrapStyle: React.CSSProperties = {
      display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%',
      marginTop: isHead ? 8 : 0,
      padding: isCode ? '6px 10px' : (isQuote ? '2px 0 2px 12px' : '1px 0'),
      background: isCode ? codeB : 'transparent',
      borderRadius: isCode ? 7 : 0,
      borderLeft: isQuote ? `3px solid ${accent}88` : 'none',
    };
    const prefix = block.type === 'bullet' ? (
      <span style={{ color: txtM, fontSize: 20, lineHeight: 1.5, flexShrink: 0, userSelect: 'none', marginTop: 1 }}>·</span>
    ) : block.type === 'numbered' ? (
      <span style={{ color: txtM, fontSize: 13, lineHeight: 1.8, flexShrink: 0, minWidth: 18, userSelect: 'none' }}>{idx + 1}.</span>
    ) : block.type === 'todo' ? (
      <div
        onMouseDown={e => { if (!readonly) { e.preventDefault(); upd(block.id, { checked: !block.checked }); } }}
        style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 5,
          border: block.checked ? 'none' : `1.5px solid ${bord}`,
          background: block.checked ? accent : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: readonly ? 'default' : 'pointer', transition: 'all 0.15s',
        }}
      >
        {block.checked && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </div>
    ) : null;

    return (
      <div key={block.id} style={wrapStyle}>
        {prefix}
        <textarea
          ref={el => { refs.current[block.id] = el; if (el) autoGrow(el); }}
          value={block.text}
          placeholder={block.type === 'paragraph' && !readonly ? "Type '/' for commands…" : ''}
          rows={1}
          readOnly={readonly}
          onChange={e => handleChange(e, block)}
          onKeyDown={e => handleKeyDown(e, block)}
          style={getTextareaStyle(block.type, block.checked)}
        />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          border: `1px solid ${bord}`, borderRadius: 10,
          padding: '12px 16px', background: surf,
          minHeight: 100, display: 'flex', flexDirection: 'column', gap: 2,
          cursor: readonly ? 'default' : 'text',
        }}
        onClick={e => {
          if (!readonly && e.target === e.currentTarget && blocks.length > 0) {
            const last = blocks[blocks.length - 1];
            if (last) refs.current[last.id]?.focus();
          }
        }}
      >
        {blocks.map((block, idx) => renderBlock(block, idx))}
      </div>

      {/* Slash command menu — rendered via portal to escape transformed/overflow ancestors */}
      {slashMenu && filteredCmds.length > 0 && createPortal(
        <div style={{
          position: 'fixed',
          top: Math.min(slashMenu.y, window.innerHeight - 320),
          left: Math.min(slashMenu.x, window.innerWidth - 245),
          width: 240, zIndex: 99999,
          background: surf, border: `1px solid ${bord}`,
          borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '7px 12px 5px', fontSize: 10.5, fontWeight: 600, color: txtM, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Block type
          </div>
          {filteredCmds.map((cmd, i) => (
            <div key={cmd.type}
              onMouseDown={e => { e.preventDefault(); applyCmd(cmd, slashMenu.blockId); }}
              onMouseEnter={() => setMenuIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', cursor: 'pointer',
                background: menuIdx === i ? (accent + '18') : 'transparent',
                transition: 'background 0.08s',
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: menuIdx === i ? (accent + '22') : col,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: menuIdx === i ? accent : txt2,
                transition: 'all 0.08s',
              }}>
                {cmd.icon}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: txt, margin: 0 }}>{cmd.label}</p>
                <p style={{ fontSize: 11, color: txtM, margin: 0, marginTop: 1 }}>{cmd.desc}</p>
              </div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
