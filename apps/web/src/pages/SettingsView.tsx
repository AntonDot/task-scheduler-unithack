import { useState, useEffect, useRef } from 'react';
import type { Theme } from '@/theme/theme';
import { Avatar, setAvatarUrl } from '@/components/kanban/Avatar';
import { useAuthStore } from '@/store/authStore';
import { updateProfile } from '@/api/auth';
import { getPushStatus, getPushDiagnostics, enablePushNotifications, type PushStatus } from '@/api/push';
import { useT, useLangStore, type Language } from '@/i18n';

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

function PushRow({ accent, theme: th, t }: { accent: string; theme: Theme; t: (key: string) => string }) {
  const [status, setStatus] = useState<PushStatus>('checking');
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const diag = getPushDiagnostics();

  useEffect(() => {
    getPushStatus().then(setStatus).catch(() => setStatus('unsupported'));
  }, []);

  const dot: Record<Exclude<PushStatus, 'checking'>, string> = {
    'no-https': '#EF4444', unsupported: '#9CA3AF', 'needs-pwa': '#D97706',
    denied: '#EF4444', subscribed: '#059669', unsubscribed: '#9CA3AF',
  };

  const labels: Record<Exclude<PushStatus, 'checking'>, string> = {
    'no-https':   t('settings.pushHttpsRequired'),
    unsupported:  diag.ios
      ? t('settings.pushIosHint')
      : t('settings.pushNotSupported'),
    'needs-pwa':  t('settings.pushIosSafari'),
    denied:       t('settings.pushIosBlocked'),
    subscribed:   t('settings.pushActive'),
    unsubscribed: t('settings.pushClickEnable'),
  };

  async function handleEnable() {
    setLoading(true);
    const next = await enablePushNotifications();
    setStatus(next);
    setLoading(false);
  }

  return (
    <div style={{ padding: '18px 0', borderBottom: `1px solid ${th.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 20, fontWeight: 500, color: th.text, margin: 0 }}>{t('settings.pushNotifications')}</p>
            {status !== 'checking' && (
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot[status] }} />
            )}
          </div>
          <p style={{ fontSize: 15, color: th.textMuted, marginTop: 3 }}>
            {status === 'checking' ? t('settings.pushCheckingStatus') : labels[status]}
          </p>
        </div>
        {status === 'unsubscribed' && (
          <button
            onClick={handleEnable}
            disabled={loading}
            style={{
              padding: '10px 22px', borderRadius: 12, border: 'none',
              background: loading ? th.border : accent, color: loading ? th.textMuted : 'white',
              fontSize: 18, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
              fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            {loading ? t('common.enabling') : t('common.enable')}
          </button>
        )}
      </div>
      {/* Debug panel — tap to expand */}
      {status !== 'checking' && status !== 'subscribed' && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => setShowDebug(v => !v)}
            style={{ fontSize: 13, color: th.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
          >
            {showDebug ? '▾ hide debug' : '▸ debug info'}
          </button>
          {showDebug && (
            <pre style={{
              marginTop: 6, padding: '10px 14px', borderRadius: 10,
              background: th.surface, border: `1px solid ${th.border}`,
              fontSize: 12, color: th.textMuted, lineHeight: 1.6, overflowX: 'auto',
            }}>
              {JSON.stringify(diag, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function SettingsView({ accent, theme, darkMode, onToggleDark, accentColor, setAccentColor }: SettingsViewProps) {
  const th = theme;
  const { user, setAuth, token } = useAuthStore();
  const t = useT();
  const { language, setLanguage } = useLangStore();

  const [notifs, setNotifs] = useState<NotifSetting[]>(loadNotifs);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [avatarKey, setAvatarKey] = useState(0);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setAvatarUrl(user.id, dataUrl);
      setAvatarKey(k => k + 1);
      // Persist to server so avatar syncs across devices
      try {
        const updated = await updateProfile({ avatar_data: dataUrl });
        if (token) setAuth({ ...user, avatar_data: updated.avatar_data }, token);
      } catch {}
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  // Sync language from profile to i18n store on mount
  useEffect(() => {
    if (user?.language && useLangStore.getState().language !== user.language) {
      useLangStore.getState().setLanguage(user.language as Language);
    }
  }, [user?.language]);

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

  async function handleColorChange(c: string) {
    setAccentColor(c);
    if (!user || !token) return;
    try {
      const updated = await updateProfile({ accent_color: c });
      setAuth({ ...user, accent_color: updated.accent_color }, token);
    } catch (e) {
      console.error("Failed to save accent color", e);
    }
  }

  async function handleLanguageChange(lang: Language) {
    setLanguage(lang);
    if (!user || !token) return;
    try {
      await updateProfile({ language: lang });
      setAuth({ ...user, language: lang }, token);
    } catch (e) {
      console.error("Failed to save language", e);
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
        <h2 style={{ fontSize: 30, fontWeight: 700, color: th.text, marginBottom: 42 }}>{t('settings.title')}</h2>

      {/* Profile */}
      <Section title={t('settings.profile')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '24px', background: th.surface, border: `1px solid ${th.border}`, borderRadius: 18, marginBottom: 18 }}>
          <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => avatarInputRef.current?.click()} title="Change photo">
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
            <Avatar key={avatarKey} user={{ full_name: user?.full_name ?? '?', id: user?.id ?? 0 }} size={78} />
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0, transition: 'opacity 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: th.text, margin: 0 }}>{user?.full_name ?? '—'}</p>
            <p style={{ fontSize: 18, color: th.textSecondary, margin: 0 }}>{user?.email ?? '—'}</p>
          </div>
          <button onClick={openEdit} style={{ padding: '10px 20px', borderRadius: 12, border: `1px solid ${th.border}`, background: 'none', fontSize: 19, fontWeight: 500, color: th.textSecondary, cursor: 'pointer', fontFamily: 'inherit' }}>
            {t('settings.editProfile')}
          </button>
        </div>
      </Section>

      {/* Appearance */}
      <Section title={t('settings.appearance')}>
        <Row label={t('settings.darkMode')} sub={t('settings.darkModeHint')}
          right={<Toggle val={darkMode} onChange={onToggleDark} accent={accent} />} />
        <Row label={t('settings.accentColor')} sub={t('settings.accentColorHint')}
          right={
            <div style={{ display: 'flex', gap: 8 }}>
              {ACCENT_OPTIONS.map(c => (
                <div key={c} onClick={() => handleColorChange(c)} style={{
                  width: 33, height: 33, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: accentColor === c ? `3px solid ${th.text}` : '3px solid transparent',
                  transition: 'border 0.1s', boxSizing: 'border-box',
                }} />
              ))}
            </div>
          }
        />
        <Row label={t('settings.language')} sub={t('settings.languageHint')}
          right={
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { lang: 'en' as Language, flag: '🇬🇧', label: t('languages.en') },
                { lang: 'ru' as Language, flag: '🇷🇺', label: t('languages.ru') },
                { lang: 'he' as Language, flag: '🇮🇱', label: t('languages.he') },
              ]).map(({ lang, flag, label }) => (
                <button
                  key={lang}
                  onClick={() => handleLanguageChange(lang)}
                  style={{
                    padding: '6px 14px', borderRadius: 10, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 15, fontWeight: language === lang ? 700 : 400,
                    border: language === lang ? `2px solid ${accent}` : `1px solid ${th.border}`,
                    background: language === lang ? accent + '15' : 'none',
                    color: language === lang ? accent : th.textSecondary,
                    transition: 'all 0.12s', display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <span>{flag}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          }
        />
      </Section>

      {/* Notifications */}
      <Section title={t('settings.notifications')}>
        <PushRow accent={accent} theme={th} t={t} />
        {notifs.map((n, i) => {
          const labelKey: Record<string, string> = {
            task_assigned: 'settings.notifTaskAssigned',
            comment:       'settings.notifNewComment',
            deadline:      'settings.notifDeadline',
            status_change: 'settings.notifStatusChange',
            mention:       'settings.notifMention',
            weekly:        'settings.notifWeeklyDigest',
          };
          return (
            <Row key={n.id} label={t(labelKey[n.id] ?? n.id)}
              right={<Toggle val={n.enabled} onChange={v => setNotifs(ns => ns.map((x, j) => j === i ? { ...x, enabled: v } : x))} accent={accent} />}
            />
          );
        })}
      </Section>

      {/* Workspace */}
      <Section title={t('settings.workspace')}>
        <Row label={t('settings.exportData')} sub={t('settings.exportHint')}
          right={
            <button style={{ padding: '9px 20px', borderRadius: 12, border: `1px solid ${th.border}`, background: 'none', fontSize: 18, fontWeight: 500, color: th.textSecondary, cursor: 'pointer', fontFamily: 'inherit' }}>
              {t('common.export')}
            </button>
          }
        />
        <Row label={t('settings.deleteWorkspace')} sub={t('settings.deleteWorkspaceHint')}
          right={
            <button style={{ padding: '9px 20px', borderRadius: 12, border: '1px solid #FECACA', background: '#FEF2F2', fontSize: 18, fontWeight: 500, color: '#991B1B', cursor: 'pointer', fontFamily: 'inherit' }}>
              {t('common.delete')}
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
            <h3 style={{ fontSize: 24, fontWeight: 700, color: th.text, marginBottom: 30, margin: 0 }}>{t('settings.editProfile')}</h3>
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ fontSize: 18, fontWeight: 600, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>{t('settings.fullName')}</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} placeholder={t('settings.yourName')} />
              </div>
              <div>
                <label style={{ fontSize: 18, fontWeight: 600, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>{t('settings.email')}</label>
                <input value={editEmail} onChange={e => setEditEmail(e.target.value)} style={inputStyle} placeholder={t('settings.emailPlaceholder')} />
              </div>
              {editError && <p style={{ fontSize: 18, color: '#DC2626', margin: 0 }}>{editError}</p>}
            </div>
            <div style={{ display: 'flex', gap: 15, justifyContent: 'flex-end', marginTop: 32 }}>
              <button onClick={() => setEditOpen(false)} style={{ padding: '12px 26px', borderRadius: 12, border: `1px solid ${th.border}`, background: 'none', fontSize: 20, fontWeight: 500, color: th.textSecondary, cursor: 'pointer', fontFamily: 'inherit' }}>
                {t('common.cancel')}
              </button>
              <button onClick={saveProfile} disabled={editSaving} style={{ padding: '12px 26px', borderRadius: 12, border: 'none', background: accent, color: 'white', fontSize: 20, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {editSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
