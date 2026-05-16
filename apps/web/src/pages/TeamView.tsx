import type { Task } from '@/types/domain';
import type { Theme } from '@/theme/theme';
import { Avatar } from '@/components/kanban/Avatar';
import type { ProjectMember } from '@/api/members';

interface TeamViewProps {
  tasks: Task[];
  members: ProjectMember[];
  accent: string;
  theme: Theme;
  doneColumnId?: number;
}

export function TeamView({ tasks, members, accent, theme, doneColumnId }: TeamViewProps) {
  const th = theme;

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto', flex: 1 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: th.text, marginBottom: 24 }}>Team</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {members.map(member => {
          const mt   = tasks.filter(t => t.assignee_id === member.id);
          const done = doneColumnId
            ? mt.filter(t => t.column_id === doneColumnId).length
            : 0;
          return (
            <div key={member.id} style={{
              background: th.surface, border: `1px solid ${th.border}`,
              borderRadius: 14, padding: '20px',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar user={{ id: member.id, full_name: member.full_name }} size={44} />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: th.text, margin: 0 }}>{member.full_name}</p>
                  <p style={{ fontSize: 12, color: th.textMuted, margin: 0 }}>{member.role}</p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {[
                  { label: 'assigned', value: mt.length, color: accent },
                  { label: 'done',     value: done,       color: '#059669' },
                  { label: 'open',     value: mt.length - done, color: '#D97706' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 22, fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
                    <p style={{ fontSize: 11, color: th.textMuted, margin: 0 }}>{s.label}</p>
                  </div>
                ))}
              </div>
              <div style={{ height: 4, background: th.columnBg, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', background: '#059669', borderRadius: 2,
                  width: `${mt.length > 0 ? (done / mt.length) * 100 : 0}%`,
                  transition: 'width 0.4s',
                }} />
              </div>
            </div>
          );
        })}
        {members.length === 0 && (
          <p style={{ color: th.textMuted, fontSize: 14 }}>No team members yet.</p>
        )}
      </div>
    </div>
  );
}
