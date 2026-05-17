
interface LogoProps {
  size?: number;
  borderRadius?: number;
}

export function Logo({ size = 28, borderRadius = 8 }: LogoProps) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: borderRadius,
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <img
        src="/icon-192.png"
        alt="Logo"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}
