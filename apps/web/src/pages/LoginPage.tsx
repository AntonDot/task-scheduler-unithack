import { useState, useEffect } from "react";
import { getLoginMode } from "@/api/auth";

interface LoginPageProps {
  onLogin: (email: string, password?: string) => Promise<void>;
}

const DEMO_USERS = [
  { email: "d.morozov@victorygroup.ru", name: "Дмитрий Морозов", role: "Owner", color: "#6366F1" },
  { email: "a.kozlova@victorygroup.ru", name: "Анна Козлова", role: "Assignee", color: "#EC4899" },
  { email: "i.petrov@victorygroup.ru", name: "Игорь Петров", role: "Assignee", color: "#14B8A6" },
];

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [devMode, setDevMode] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    getLoginMode()
      .then((m) => setDevMode(m.dev_login))
      .catch(() => setDevMode(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      await onLogin(email.trim(), password || undefined);
    } catch {
      setError(devMode ? "Вход не удался. Бэкенд запущен?" : "Неверный email или пароль");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setLoading(true);
    setError("");
    try {
      await onLogin(demoEmail);
    } catch {
      setError("Вход не удался. Бэкенд запущен?");
    } finally {
      setLoading(false);
    }
  };

  const accent = "#6366F1";

  const inputStyle = (field: string): React.CSSProperties => ({
    width: "100%",
    padding: "11px 14px",
    borderRadius: 10,
    border: `1.5px solid ${focusedField === field ? accent : "#E2E8F0"}`,
    fontSize: 14,
    color: "#0F172A",
    background: "#FAFAFA",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  });

  if (devMode === null) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 14 }}>Загрузка…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 14, boxShadow: `0 6px 20px ${accent}40`,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 3 14h9l-1 8 10-12h-9z" fill="white" stroke="none" />
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0, letterSpacing: "-0.03em" }}>
            Victory Group
          </h1>
          <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 5, fontWeight: 500 }}>
            Планировщик задач
          </p>
        </div>

        {error && (
          <div style={{
            padding: "10px 14px", borderRadius: 10, marginBottom: 16,
            background: "#FEF2F2", border: "1px solid #FECACA",
            fontSize: 13, color: "#DC2626", fontWeight: 500,
          }}>
            {error}
          </div>
        )}

        {devMode ? (
          <>
            <p style={{ fontSize: 11.5, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>
              Dev Mode — Быстрый вход
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {DEMO_USERS.map((u) => (
                <button
                  key={u.email}
                  disabled={loading}
                  onClick={() => handleDemoLogin(u.email)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 14px", borderRadius: 12,
                    border: "1.5px solid #E2E8F0", background: "white",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontFamily: "inherit", opacity: loading ? 0.6 : 1,
                    transition: "border-color 0.12s, box-shadow 0.12s",
                    textAlign: "left",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget.style.borderColor = accent);
                    (e.currentTarget.style.boxShadow = `0 2px 12px ${accent}20`);
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget.style.borderColor = "#E2E8F0");
                    (e.currentTarget.style.boxShadow = "none");
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, background: u.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white", fontSize: 13, fontWeight: 700, flexShrink: 0,
                  }}>
                    {getInitials(u.name)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>{u.role}</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                required
                disabled={loading}
                style={inputStyle("email")}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>
                Пароль
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={loading}
                style={inputStyle("password")}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email.trim()}
              style={{
                padding: "12px", borderRadius: 10, border: "none",
                background: email.trim() ? accent : "#E2E8F0",
                color: email.trim() ? "white" : "#94A3B8",
                fontSize: 14, fontWeight: 700,
                cursor: email.trim() && !loading ? "pointer" : "not-allowed",
                fontFamily: "inherit", marginTop: 2,
                boxShadow: email.trim() ? `0 4px 14px ${accent}44` : "none",
                transition: "all 0.15s",
              }}
            >
              {loading ? "Вход…" : "Войти"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, #F0F4FF 0%, #FAF5FF 50%, #F0FDFA 100%)",
  padding: "20px",
  fontFamily: "'Inter', -apple-system, sans-serif",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 380,
  background: "white",
  borderRadius: 20,
  padding: "32px 28px",
  boxShadow: "0 4px 6px rgba(0,0,0,0.04), 0 20px 60px rgba(0,0,0,0.08)",
};
