import { useState, useRef, useEffect } from 'react';
import type { Theme } from '@/theme/theme';
import type { AppView } from './Sidebar';
import { Avatar } from '@/components/kanban/Avatar';
import { IcoSearch, IcoBell, IcoMoon, IcoSun, IcoPlus } from '@/components/ui/Icons';
import type { ProjectMember } from '@/api/members';
import { fetchNotifications, type NotificationItem } from '@/api/notifications';

const NOTIF_SETTINGS_KEY = 'vt_notif_settings';

function loadNotifPrefs(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(NOTIF_SETTINGS_KEY) ?? '{}'); } catch { return {}; }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m}м назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч назад`;
  return `${Math.floor(h / 24)}д назад`;
}

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
  onOpenTask?: (taskId: number, section?: 'comments' | 'description') => void;
}

import { useAuthStore } from '@/store/authStore';

export function Header({ view, search, setSearch, onAddTask, accent, theme, darkMode, onToggleDark, members, onOpenTask }: HeaderProps) {
  const th = theme;
  const titles: Record<AppView, string> = {
    kanban: 'Board', automations: 'Automations', analytics: 'Analytics',
    team: 'Team', settings: 'Settings',
  };

  const { user } = useAuthStore();
  const [darkHover, setDarkHover] = useState(false);
  const [bellOpen,  setBellOpen]  = useState(false);
  const [allNotifs,   setAllNotifs]   = useState<NotificationItem[]>([]);
  const NOTIF_READ_KEY = `vt_read_notifs_${user?.id || 'default'}`;
  const [readIds,     setReadIds]     = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(NOTIF_READ_KEY) ?? '[]') as string[]); }
    catch { return new Set<string>(); }
  });
  const bellRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Re-initialize when user changes
  useEffect(() => {
    try { setReadIds(new Set(JSON.parse(localStorage.getItem(NOTIF_READ_KEY) ?? '[]') as string[])); }
    catch { setReadIds(new Set()); }
  }, [NOTIF_READ_KEY]);

  // Persist read IDs to localStorage
  useEffect(() => {
    localStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...readIds]));
  }, [readIds, NOTIF_READ_KEY]);

  // Fetch real notifications
  useEffect(() => {
    fetchNotifications().then(setAllNotifs).catch(() => {});
    const id = setInterval(() => fetchNotifications().then(setAllNotifs).catch(() => {}), 60000);
    return () => clearInterval(id);
  }, []);

  // Filter by user's notification preferences
  const prefs = loadNotifPrefs();
  const defaultEnabled: Record<string, boolean> = {
    task_assigned: true, comment: true, deadline: true,
    mention: true, status_change: false, weekly: false,
  };
  const notifs = allNotifs.filter(n => {
    const enabled = prefs[n.type] ?? defaultEnabled[n.type] ?? true;
    return enabled;
  }).slice(0, 20);

  // Close dropdown on outside click
  useEffect(() => {
    if (!bellOpen) return;
    function handler(e: MouseEvent) {
      if (
        bellRef.current && !bellRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [bellOpen]);

  const unreadCount = notifs.filter(n => !readIds.has(n.id)).length;
  const onlineMembers = members.slice(0, 4);

  function iconBtn(hovered: boolean): React.CSSProperties {
    return {
      background: hovered ? th.columnBg : 'none',
      border: 'none', cursor: 'pointer',
      color: hovered ? th.text : th.textSecondary,
      padding: '6px 8px', borderRadius: 7,
      display: 'flex', transition: 'color 0.12s, background 0.12s',
    };
  }

  return (
    <div style={{
      height: 56, background: th.surface, borderBottom: `1px solid ${th.border}`,
      display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, flexShrink: 0,
      position: 'relative',
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

      {/* Dark mode toggle — uses React state so bg resets correctly on theme change */}
      <button
        ref={undefined}
        onClick={onToggleDark}
        title={darkMode ? 'Light mode' : 'Dark mode'}
        style={iconBtn(darkHover)}
        onMouseEnter={() => setDarkHover(true)}
        onMouseLeave={() => setDarkHover(false)}
      >
        {darkMode ? <IcoSun size={18} /> : <IcoMoon size={18} />}
      </button>

      {/* Bell */}
      <div style={{ position: 'relative' }}>
        <button
          ref={bellRef}
          onClick={() => { setBellOpen(o => !o); }}
          style={{ ...iconBtn(bellOpen), position: 'relative' }}
        >
          <IcoBell size={18} />
          {unreadCount > 0 && (
            <div style={{
              position: 'absolute', top: 4, right: 4,
              width: 8, height: 8, borderRadius: '50%', background: '#EF4444',
              border: `2px solid ${th.surface}`,
            }} />
          )}
        </button>

        {/* Notification dropdown */}
        {bellOpen && (
          <div ref={dropRef} style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 340, background: th.surface,
            border: `1px solid ${th.border}`, borderRadius: 14,
            boxShadow: '0 12px 40px rgba(0,0,0,0.14)',
            zIndex: 200, overflow: 'hidden', maxHeight: 440, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${th.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: th.text }}>Уведомления</h4>
              <button onClick={() => setReadIds(new Set(notifs.map(n => n.id)))} style={{
                background: 'none', border: 'none', color: accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0
              }}>Прочитать все</button>
            </div>
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              {notifs.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: th.textMuted, fontSize: 13 }}>
                  Нет уведомлений
                </div>
              ) : (
                notifs.map(n => {
                  const unread = !readIds.has(n.id);
                  const section = (n.type === 'comment' || n.type === 'mention') ? 'comments' : undefined;
                  return (
                    <div
                      key={n.id}
                      onClick={() => {
                        setBellOpen(false);
                        setReadIds(prev => new Set([...prev, n.id]));
                        onOpenTask?.(n.task_id, section);
                      }}
                      style={{
                        padding: '11px 16px', borderBottom: `1px solid ${th.border}`,
                        background: unread ? accent + '08' : 'transparent',
                        display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { (e.currentTarget.style.background = accent + '12'); }}
                      onMouseLeave={e => { (e.currentTarget.style.background = unread ? accent + '08' : 'transparent'); }}
                    >
                      <div style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: unread ? accent : 'transparent',
                        flexShrink: 0, marginTop: 6,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12.5, fontWeight: 600, color: th.text, margin: 0, marginBottom: 2 }}>{n.title}</p>
                        <p style={{ fontSize: 11.5, color: th.textSecondary, margin: 0, lineHeight: 1.4 }}>{n.body}</p>
                        <p style={{ fontSize: 10.5, color: th.textMuted, margin: 0, marginTop: 3 }}>{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

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
