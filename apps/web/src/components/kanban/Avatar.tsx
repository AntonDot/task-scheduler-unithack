interface AvatarProps {
  name: string;
  size?: number;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const COLORS = [
  "#6c63ff", "#e74c3c", "#2ed573", "#ffa502",
  "#1e90ff", "#ff6b81", "#7bed9f", "#eccc68",
];

function colorFromName(name: string): string {
  let hash = 0;
  for (const ch of name) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length]!;
}

export function Avatar({ name, size = 28 }: AvatarProps) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: colorFromName(name),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 600,
        color: "#fff",
        flexShrink: 0,
      }}
      title={name}
    >
      {getInitials(name)}
    </span>
  );
}
