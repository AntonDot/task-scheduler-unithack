interface AvatarUser {
  full_name: string;
  id?: number;
}

interface AvatarProps {
  user?: AvatarUser | null;
  size?: number;
  showOnline?: boolean;
  online?: boolean;
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function avatarColor(user: AvatarUser): string {
  const colors = ['#6366F1','#7C3AED','#059669','#D97706','#2563EB','#DC2626','#0891B2'];
  const seed = (user.id ?? 0) + (user.full_name.charCodeAt(0) ?? 0);
  return colors[seed % colors.length] ?? colors[0] ?? '#6366F1';
}

export function Avatar({ user, size = 28, showOnline = false, online = false }: AvatarProps) {
  if (!user) return null;
  const color = avatarColor(user);
  const init  = initials(user.full_name);
  const dotSize = Math.max(Math.round(size * 0.30), 8);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }} title={user.full_name}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: color, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: 'white', fontSize: Math.round(size * 0.36), fontWeight: 600,
        letterSpacing: '-0.02em', userSelect: 'none',
      }}>
        {init}
      </div>
      {showOnline && online && (
        <div style={{
          position: 'absolute', bottom: 0, right: 0,
          width: dotSize, height: dotSize,
          background: '#10B981', border: '2px solid white',
          borderRadius: '50%',
        }} />
      )}
    </div>
  );
}
