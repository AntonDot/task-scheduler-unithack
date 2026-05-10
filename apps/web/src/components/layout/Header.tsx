import type { Theme } from '@/theme/theme';
import type { AppView } from './Sidebar';
import { Avatar } from '@/components/kanban/Avatar';
import { IcoSearch, IcoBell, IcoMoon, IcoSun, IcoPlus } from '@/components/ui/Icons';
import type { ProjectMember } from '@/api/members';

interface HeaderProps {
  view: AppView;
  search: string;
  setSearch: (v: string) => void;
  onAddTask: () => void;
  accent: string;
  theme: Theme;
  darkMode: boolean;
  onToggleDark: () => void;
  members: ProjectMember[];
}

export function Header({ view, search, setSearch, onAddTask, accent, theme, darkMode, onToggleDark, members }: HeaderProps) {
  const th = theme;
  const titles: Record<AppView, string> = {
    kanban: 'Board', automations: 'Automations', analytics: 'Analytics',
    team: 'Team', settings: 'Settings',
  };

  const iconBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: th.textSecondary, padding: '6px 8px', borderRadius: 7,
    display: 'flex', transition: 'color 0.12s, background 0.12s',
  };

  // Show only up to 3 online members in header
  const onlineMembers = members.slice(0, 4);

  return (
    <div style={{
      height: 56, background: th.surface, borderBottom: `1px solid ${th.border}`,
      display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, flexShrink: 0,
    }}>
      <h1 style={{ fontSize: 15, fontWeight: 700, color: th.text, whiteSpace: 'nowrap' }}>
        {titles[view] || 'Board'}
      </h1>

      {view === 'kanban' && (
        <div style={{ maxWidth: 340, flex: 1, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: th.textMuted, pointerEvents: 'none' }}>
            <IcoSearch size={14} />
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            style={{
              width: '100%', padding: '7px 12px 7px 32px',
              border: `1px solid ${th.border}`, borderRadius: 8,
              fontSize: 13, color: th.text, background: th.inputBg,
              outline: 'none', transition: 'border-color 0.15s', fontFamily: 'inherit',
            }}
            onFocus={e => (e.target.style.borderColor = accent)}
            onBlur={e => (e.target.style.borderColor = th.border)}
          />
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Online users */}
      {onlineMembers.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {onlineMembers.map((m, i) => (
            <div key={m.id} style={{ marginLeft: i > 0 ? -8 : 0, zIndex: onlineMembers.length - i }}>
              <Avatar user={{ id: m.id, full_name: m.full_name }} size={29} />
            </div>
          ))}
          <span style={{ fontSize: 11.5, color: th.textMuted, marginLeft: 10, whiteSpace: 'nowrap' }}>
            {members.length} members
          </span>
        </div>
      )}

      {/* Dark mode toggle */}
      <button onClick={onToggleDark} title={darkMode ? 'Light mode' : 'Dark mode'} style={iconBtn}
        onMouseEnter={e => { e.currentTarget.style.color = th.text; e.currentTarget.style.background = th.columnBg; }}
        onMouseLeave={e => { e.currentTarget.style.color = th.textSecondary; e.currentTarget.style.background = 'none'; }}
      >
        {darkMode ? <IcoSun size={18} /> : <IcoMoon size={18} />}
      </button>

      {/* Bell */}
      <button style={{ ...iconBtn, position: 'relative' }}
        onMouseEnter={e => { e.currentTarget.style.color = th.text; e.currentTarget.style.background = th.columnBg; }}
        onMouseLeave={e => { e.currentTarget.style.color = th.textSecondary; e.currentTarget.style.background = 'none'; }}
      >
        <IcoBell size={18} />
        <div style={{
          position: 'absolute', top: 5, right: 5,
          width: 7, height: 7, borderRadius: '50%', background: '#EF4444',
          border: `2px solid ${th.surface}`,
        }} />
      </button>

      {/* New task */}
      <button onClick={onAddTask} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 9,
        background: accent, color: 'white', border: 'none',
        cursor: 'pointer', fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap',
        boxShadow: `0 2px 10px ${accent}44`, transition: 'opacity 0.12s',
        fontFamily: 'inherit',
      }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        <IcoPlus size={15} />New task
      </button>
    </div>
  );
}
