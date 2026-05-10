import type { Task } from '@/types/domain';
import type { Theme } from '@/theme/theme';
import { URGENCY_MAP, statusToColumn } from '@/theme/theme';

interface AnalyticsViewProps {
  tasks: Task[];
  accent: string;
  theme: Theme;
}

export function AnalyticsView({ tasks, accent, theme }: AnalyticsViewProps) {
  const th = theme;

  const stats = [
    { label: 'Total tasks',  value: tasks.length, color: accent },
    { label: 'In progress',  value: tasks.filter(t => statusToColumn(t.status) === 'in-progress').length, color: '#D97706' },
    { label: 'In review',    value: tasks.filter(t => statusToColumn(t.status) === 'review').length, color: th.textSecondary },
    { label: 'Completed',    value: tasks.filter(t => statusToColumn(t.status) === 'done').length, color: '#059669' },
  ];

  // Group by project
  const projectMap = new Map<number, { name: string; color: string; total: number; done: number }>();
  tasks.forEach(t => {
    if (!t.project) return;
    const existing = projectMap.get(t.project.id) || { name: t.project.name, color: t.project.color || accent, total: 0, done: 0 };
    existing.total++;
    if (statusToColumn(t.status) === 'done') existing.done++;
    projectMap.set(t.project.id, existing);
  });
  const byProject = Array.from(projectMap.values());

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto', flex: 1, color: th.text }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: th.text }}>Analytics</h2>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14, padding: '18px 22px' }}>
            <p style={{ fontSize: 12, color: th.textMuted, fontWeight: 500, marginBottom: 8 }}>{s.label}</p>
            <p style={{ fontSize: 32, fontWeight: 700, color: s.color, lineHeight: 1, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Progress by project */}
        <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14, padding: '20px 22px' }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: th.text, marginBottom: 16 }}>Progress by project</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {byProject.length === 0 && (
              <p style={{ fontSize: 13, color: th.textMuted, fontStyle: 'italic' }}>No project data</p>
            )}
            {byProject.map(p => (
              <div key={p.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12.5, color: th.textSecondary, fontWeight: 500 }}>{p.name}</span>
                  <span style={{ fontSize: 12.5, color: th.textMuted }}>{p.done}/{p.total}</span>
                </div>
                <div style={{ height: 6, background: th.columnBg, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3, background: p.color,
                    width: `${p.total > 0 ? (p.done / p.total) * 100 : 0}%`,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By urgency */}
        <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 14, padding: '20px 22px' }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: th.text, marginBottom: 16 }}>Tasks by urgency</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(URGENCY_MAP).map(([id, u]) => {
              const count = tasks.filter(t => t.urgency.toLowerCase() === id).length;
              return (
                <div key={id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 13px', borderRadius: 9, background: u.bg,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: u.border }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: u.color }}>{u.label}</span>
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 700, color: u.color }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
