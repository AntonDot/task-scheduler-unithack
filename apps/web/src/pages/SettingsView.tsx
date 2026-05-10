import { useState, useEffect } from 'react';
import type { Theme } from '@/theme/theme';
import { Avatar } from '@/components/kanban/Avatar';
import { useAuthStore } from '@/store/authStore';
import { updateProfile } from '@/api/auth';

interface SettingsViewProps {
  accent: string;
  theme: Theme;
  darkMode: boolean;
  onToggleDark: () => void;
  accentColor: string;
  setAccentColor: (c: string) => void;
}

interface NotifSetting { id: string; label: string; enabled: boolean; }

const NOTIF_DEFAULT: NotifSetting[] = [
  { id: 'task_assigned', label: 'Task assigned to me',     enabled: true  },
  { id: 'comment',       label: 'New comment on my task',  enabled: true  },
  { id: 'deadline',      label: 'Deadline reminder (24h)', enabled: true  },
  { id: 'status_change', label: 'Task status changes',     enabled: false },
  { id: 'mention',       label: '@mention in comments',    enabled: true  },
  { id: 'weekly',        label: 'Weekly digest email',     enabled: false },
];

const ACCENT_OPTIONS = ['#6366F1', '#7C3AED', '#059669', '#DC2626', '#D97706', '#0EA5E9'];
const NOTIF_KEY = 'vt_notif_settings';

function loadNotifs(): NotifSetting[] {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    if (raw) {
      const saved: Record<string, boolean> = JSON.parse(raw);
      return NOTIF_DEFAULT.map(n => ({ ...n, enabled: saved[n.id] ?? n.enabled }));
    }
  } catch {}
  return NOTIF_DEFAULT;
}

function Toggle({ val, onChange, accent }: { val: boolean; onChange: (v: boolean) => void; accent: string }) {
  return (
    <div onClick={() => onChange(!val)} style={{
      width: 57, height: 33, borderRadius: 16,
      background: val ? accent : '#D1D5DB',
      position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s',
    }}>
      <div style={{
        position: 'absolute', top: 4, left: val ? 28 : 4,
        width: 25, height: 25, borderRadius: '50%', background: 'white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
      }} />
    </div>
  );
}

export function SettingsView({ accent, theme, darkMode, onToggleDark, accentColor, setAccentColor }: SettingsViewProps) {
  const th = theme;
  const { user, setAuth, token } = useAuthStore();

  const [notifs, setNotifs] = useState<NotifSetting[]>(loadNotifs);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Persist notification settings to localStorage whenever they change
  useEffect(() => {
    const map: Record<string, boolean> = {};
    notifs.forEach(n => { map[n.id] = n.enabled; });
    localStorage.setItem(NOTIF_KEY, JSON.stringify(map));
  }, [notifs]);

  function openEdit() {
    setEditName(user?.full_name ?? '');
    setEditEmail(user?.email ?? '');
    setEditError('');
    setEditOpen(true);
  }

  async function saveProfile() {
    if (!editName.trim()) { setEditError('Name is required'); return; }
    if (!editEmail.trim()) { setEditError('Email is required'); return; }
    setEditSaving(true);
    setEditError('');
    try {
      const updated = await updateProfile({ full_name: editName.trim(), email: editEmail.trim() });
      if (user && token) setAuth({ ...user, full_name: updated.full_name, email: updated.email }, token);
      setEditOpen(false);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  }

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div style={{ marginBottom: 42 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: th.text, marginBottom: 21, paddingBottom: 15, borderBottom: `1px solid ${th.border}` }}>
          {title}
        </h3>
        {children}
      </div>
    );
  }

  function Row({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 0', borderBottom: `1px solid ${th.border}` }}>
        <div>
          <p style={{ fontSize: 20, fontWeight: 500, color: th.text, margin: 0 }}>{label}</p>
          {sub && <p style={{ fontSize: 18, color: th.textMuted, marginTop: 3, margin: 0 }}>{sub}</p>}
        </div>
        {right}
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    padding: '12px 18px', borderRadius: 12, border: `1px solid ${th.border}`,
    background: th.inputBg, color: th.text, fontSize: 20,
    fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 960, padding: '60px 48px', margin: '0 0' }}>
        <h2 style={{ fontSize: 30, fontWeight: 700, color: th.text, marginBottom: 42 }}>Settings</h2>

      {/* Profile */}
      <Section title="Profile">
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '24px', background: th.surface, border: `1px solid ${th.border}`, borderRadius: 18, marginBottom: 18 }}>
          <Avatar user={{ full_name: user?.full_name ?? '?', id: user?.id ?? 0 }} size={78} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: th.text, margin: 0 }}>{user?.full_name ?? '—'}</p>
            <p style={{ fontSize: 18, color: th.textSecondary, margin: 0 }}>{user?.email ?? '—'}</p>
          </div>
          <button onClick={openEdit} style={{ padding: '10px 20px', borderRadius: 12, border: `1px solid ${th.border}`, background: 'none', fontSize: 19, fontWeight: 500, color: th.textSecondary, cursor: 'pointer', fontFamily: 'inherit' }}>
            Edit profile
          </button>
        </div>
      </Section>

      {/* Appearance */}
      <Section title="Appearance">
        <Row label="Dark mode" sub="Switch between light and dark interface"
          right={<Toggle val={darkMode} onChange={onToggleDark} accent={accent} />} />
        <Row label="Accent color" sub="Choose your primary action color"
          right={
            <div style={{ display: 'flex', gap: 8 }}>
              {ACCENT_OPTIONS.map(c => (
                <div key={c} onClick={() => setAccentColor(c)} style={{
                  width: 33, height: 33, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: accentColor === c ? `3px solid ${th.text}` : '3px solid transparent',
                  transition: 'border 0.1s', boxSizing: 'border-box',
                }} />
              ))}
            </div>
          }
        />
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        {notifs.map((n, i) => (
          <Row key={n.id} label={n.label}
            right={<Toggle val={n.enabled} onChange={v => setNotifs(ns => ns.map((x, j) => j === i ? { ...x, enabled: v } : x))} accent={accent} />}
          />
        ))}
      </Section>

      {/* Workspace */}
      <Section title="Workspace">
        <Row label="Export all data" sub="Download your tasks and automations as JSON"
          right={
            <button style={{ padding: '9px 20px', borderRadius: 12, border: `1px solid ${th.border}`, background: 'none', fontSize: 18, fontWeight: 500, color: th.textSecondary, cursor: 'pointer', fontFamily: 'inherit' }}>
              Export
            </button>
          }
        />
        <Row label="Delete workspace" sub="Permanently delete this workspace and all its data"
          right={
            <button style={{ padding: '9px 20px', borderRadius: 12, border: '1px solid #FECACA', background: '#FEF2F2', fontSize: 18, fontWeight: 500, color: '#991B1B', cursor: 'pointer', fontFamily: 'inherit' }}>
              Delete
            </button>
          }
        />
      </Section>

      {/* Edit Profile Modal */}
      {editOpen && (
        <>
          <div onClick={() => setEditOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.35)', zIndex: 200 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 600, background: th.surface, borderRadius: 24,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)', zIndex: 201, padding: '42px 42px 36px',
          }}>
            <h3 style={{ fontSize: 24, fontWeight: 700, color: th.text, marginBottom: 30, margin: 0 }}>Edit Profile</h3>
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ fontSize: 18, fontWeight: 600, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>Full name</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} placeholder="Your name" />
              </div>
              <div>
                <label style={{ fontSize: 18, fontWeight: 600, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>Email</label>
                <input value={editEmail} onChange={e => setEditEmail(e.target.value)} style={inputStyle} placeholder="your@email.com" />
              </div>
              {editError && <p style={{ fontSize: 18, color: '#DC2626', margin: 0 }}>{editError}</p>}
            </div>
            <div style={{ display: 'flex', gap: 15, justifyContent: 'flex-end', marginTop: 32 }}>
              <button onClick={() => setEditOpen(false)} style={{ padding: '12px 26px', borderRadius: 12, border: `1px solid ${th.border}`, background: 'none', fontSize: 20, fontWeight: 500, color: th.textSecondary, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={saveProfile} disabled={editSaving} style={{ padding: '12px 26px', borderRadius: 12, border: 'none', background: accent, color: 'white', fontSize: 20, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
