import type { Theme } from '@/theme/theme';
import { IcoBoard, IcoBolt, IcoChart, IcoUsers, IcoCog, IcoSync, IcoSidebarL, IcoLogout } from '@/components/ui/Icons';
import { Logo } from '@/components/ui/Logo';
import type { Project } from '@/types/domain';
import { useT } from '@/i18n';

export type AppView = 'kanban' | 'automations' | 'analytics' | 'team' | 'settings';

interface SidebarProps {
  view: AppView;
  setView: (v: AppView) => void;
  projects: Project[];
  activeProjectId: number | null;
  setActiveProjectId: (id: number | null) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  syncing: boolean;
  accent: string;
  theme: Theme;
  onLogout: () => void;
}

export function Sidebar({ view, setView, projects, activeProjectId, setActiveProjectId, collapsed, onToggleCollapse, syncing, accent, theme, onLogout }: SidebarProps) {
  const th = theme;
  const t  = useT();
  const w  = collapsed ? 56 : 228;

  const NAV: { id: AppView; label: string; Icon: React.FC<{ size?: number }> }[] = [
    { id: 'kanban',      label: t('nav.board'),       Icon: IcoBoard },
    { id: 'automations', label: t('nav.automations'), Icon: IcoBolt  },
    { id: 'analytics',   label: t('nav.analytics'),   Icon: IcoChart },
    { id: 'team',        label: t('nav.team'),        Icon: IcoUsers },
    { id: 'settings',    label: t('nav.settings'),    Icon: IcoCog   },
  ];

  return (
    <div style={{
      width: w, minWidth: w, height: '100%',
      background: th.sidebar, borderRight: `1px solid ${th.border}`,
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.22s ease, min-width 0.22s ease',
      overflow: 'hidden',
    }}>
      {/* Logo + collapse */}
      {collapsed ? (
        /* Collapsed: logo and toggle stacked vertically, both centered */
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '10px 0 8px', borderBottom: `1px solid ${th.border}`,
          gap: 6, flexShrink: 0,
        }}>
          <Logo size={28} />
          <button
            onClick={onToggleCollapse}
            title={t('sidebar.expandSidebar')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: th.textMuted, padding: '4px', borderRadius: 6,
              display: 'flex', transition: 'color 0.12s, background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = th.text; e.currentTarget.style.background = th.columnBg; }}
            onMouseLeave={e => { e.currentTarget.style.color = th.textMuted; e.currentTarget.style.background = 'none'; }}
          >
            <IcoSidebarL size={16} />
          </button>
        </div>
      ) : (
        /* Expanded: logo left, toggle right */
        <div style={{
          height: 56, display: 'flex', alignItems: 'center',
          padding: '0 14px 0 16px',
          borderBottom: `1px solid ${th.border}`,
          gap: 8, flexShrink: 0, justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Logo size={28} />
            <span style={{ fontSize: 15, fontWeight: 700, color: th.text, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
              Victory
            </span>
          </div>
          <button
            onClick={onToggleCollapse}
            title={t('sidebar.collapseSidebar')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: th.textMuted, padding: '4px', borderRadius: 6,
              display: 'flex', transition: 'color 0.12s, background 0.12s', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = th.text; e.currentTarget.style.background = th.columnBg; }}
            onMouseLeave={e => { e.currentTarget.style.color = th.textMuted; e.currentTarget.style.background = 'none'; }}
          >
            <IcoSidebarL size={16} />
          </button>
        </div>
      )}

      {/* Nav items */}
      <nav style={{ padding: '10px 8px', flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(item => {
            const active = view === item.id;
            return (
              <button key={item.id} onClick={() => setView(item.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 8,
                border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                background: active ? accent + '18' : 'none',
                color: active ? accent : th.textSecondary,
                fontWeight: active ? 600 : 500, fontSize: 13.5,
                transition: 'all 0.1s',
                justifyContent: collapsed ? 'center' : 'flex-start',
                whiteSpace: 'nowrap',
              }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = th.columnBg; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'none'; }}
              >
                <item.Icon size={17} />
                {!collapsed && item.label}
              </button>
            );
          })}
        </div>

        {/* Projects */}
        {!collapsed && projects.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <p style={{
              fontSize: 10.5, fontWeight: 600, color: th.textMuted,
              letterSpacing: '0.07em', textTransform: 'uppercase',
              padding: '0 10px', marginBottom: 5,
            }}>
              {t('sidebar.projects')}
            </p>
            {projects.map(p => {
              const active = activeProjectId === p.id;
              const dotColor = p.color || accent;
              return (
                <button key={p.id}
                  onClick={() => setActiveProjectId(active ? null : p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    padding: '7px 10px', borderRadius: 7, border: 'none',
                    cursor: 'pointer', width: '100%', textAlign: 'left',
                    background: active ? dotColor + '18' : 'none',
                    color: active ? dotColor : th.textSecondary,
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    transition: 'all 0.1s', whiteSpace: 'nowrap', overflow: 'hidden',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = th.columnBg; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'none'; }}
                >
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </nav>

      {/* Bottom: logout + sync */}
      <div style={{ padding: '10px 8px', borderTop: `1px solid ${th.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Logout */}
        <button
          onClick={onLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 8,
            border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
            background: 'none', color: th.textSecondary,
            fontWeight: 500, fontSize: 13.5,
            transition: 'all 0.1s',
            justifyContent: collapsed ? 'center' : 'flex-start',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = th.columnBg; e.currentTarget.style.color = '#EF4444'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = th.textSecondary; }}
        >
          <IcoLogout size={17} />
          {!collapsed && t('sidebar.signOut')}
        </button>

        {/* Sync status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px', borderRadius: 7,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <IcoSync size={14} spin={syncing} />
          {!collapsed && (
            <>
              <span style={{ fontSize: 11.5, color: th.textMuted, whiteSpace: 'nowrap' }}>
                {syncing ? t('sidebar.syncing') : t('sidebar.synced')}
              </span>
              <div style={{
                width: 6, height: 6, borderRadius: '50%', marginLeft: 'auto', flexShrink: 0,
                background: syncing ? '#F59E0B' : '#10B981',
              }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
