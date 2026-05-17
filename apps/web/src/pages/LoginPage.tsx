import { useState, useEffect } from "react";
import { getLoginMode } from "@/api/auth";

interface LoginPageProps {
  onLogin: (email: string, password?: string) => Promise<void>;
}

const DEMO_USERS = [
  { email: "d.morozov@victorygroup.ru", name: "Дмитрий Морозов", role: "Owner", project: "onegin-park, zhk-bereg", color: "#6366F1" },
  { email: "a.kozlova@victorygroup.ru", name: "Анна Козлова", role: "Assignee", project: "onegin-park", color: "#EC4899" },
  { email: "i.petrov@victorygroup.ru", name: "Игорь Петров", role: "Assignee", project: "zhk-bereg", color: "#14B8A6" },
];

const accent = "#6366F1";

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [devMode, setDevMode] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ssoInfo, setSsoInfo] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showDemoUsers, setShowDemoUsers] = useState(true);

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
    setSsoInfo("");
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
    setSsoInfo("");
    try {
      await onLogin(demoEmail);
    } catch {
      setError("Вход не удался. Бэкенд запущен?");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (field: string): React.CSSProperties => ({
    width: "100%",
    padding: "11px 14px",
    borderRadius: 10,
    border: `1.5px solid ${focusedField === field ? accent : "#E5E7EB"}`,
    fontSize: 14,
    color: "#111827",
    background: "#F9FAFB",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  });

  if (devMode === null) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Загрузка…</div>
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
            width: 56, height: 56, borderRadius: 16,
            overflow: "hidden",
            marginBottom: 14,
            boxShadow: `0 6px 24px ${accent}33`,
            flexShrink: 0,
          }}>
            <img
              src="/icon-192.png"
              alt="Victory Group"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0, letterSpacing: "-0.03em" }}>
            Victory Group
          </h1>
          <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 5, fontWeight: 500 }}>
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

        {ssoInfo && (
          <div style={{
            padding: "10px 14px", borderRadius: 10, marginBottom: 16,
            background: "#F0F9FF", border: "1px solid #BAE6FD",
            fontSize: 13, color: "#0369A1", fontWeight: 500,
          }}>
            {ssoInfo}
          </div>
        )}

        {/* Main login form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label htmlFor="email" style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 6 }}>
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
            <label htmlFor="password" style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 6 }}>
              Пароль
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
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
              background: email.trim() ? accent : "#E5E7EB",
              color: email.trim() ? "white" : "#9CA3AF",
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

        {/* SSO button */}
        <button
          type="button"
          disabled={loading}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "11px 14px",
            borderRadius: 10,
            border: `1.5px solid #E5E7EB`,
            background: "white",
            color: "#374151",
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "border-color 0.15s, box-shadow 0.15s",
            opacity: loading ? 0.6 : 1,
          }}
          onMouseEnter={e => {
            (e.currentTarget.style.borderColor = accent);
            (e.currentTarget.style.boxShadow = `0 2px 12px ${accent}20`);
          }}
          onMouseLeave={e => {
            (e.currentTarget.style.borderColor = "#E5E7EB");
            (e.currentTarget.style.boxShadow = "none");
          }}
          onClick={() => { setError(""); setSsoInfo("SSO не настроен в данной среде"); }}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Вход через SSO
        </button>

        {devMode && (
          <>
            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 16px" }}>
              <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", letterSpacing: "0.04em" }}>
                ИЛИ
              </span>
              <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
            </div>

            {/* Demo users section */}
            <div>
              <button
                type="button"
                aria-expanded={showDemoUsers}
                aria-controls="demo-users-list"
                disabled={loading}
                onClick={() => setShowDemoUsers(v => !v)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "none",
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  padding: "0 0 10px 0",
                  fontFamily: "inherit",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                  Войти как:
                </span>
                <svg
                  aria-hidden="true"
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: showDemoUsers ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {showDemoUsers && (
                <div id="demo-users-list" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {DEMO_USERS.map((u) => (
                    <button
                      key={u.email}
                      disabled={loading}
                      onClick={() => handleDemoLogin(u.email)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 12px", borderRadius: 12,
                        border: "1.5px solid #E5E7EB", background: "#F9FAFB",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontFamily: "inherit", opacity: loading ? 0.6 : 1,
                        transition: "border-color 0.12s, box-shadow 0.12s, background 0.12s",
                        textAlign: "left",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget.style.borderColor = accent);
                        (e.currentTarget.style.boxShadow = `0 2px 10px ${accent}18`);
                        (e.currentTarget.style.background = "white");
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget.style.borderColor = "#E5E7EB");
                        (e.currentTarget.style.boxShadow = "none");
                        (e.currentTarget.style.background = "#F9FAFB");
                      }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 9, background: u.color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "white", fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>
                        {getInitials(u.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>
                          {u.role} · {u.project}
                        </div>
                      </div>
                      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
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
  background: "linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 50%, #ECFDF5 100%)",
  padding: "20px",
  fontFamily: "'Inter', -apple-system, sans-serif",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 400,
  background: "#FFFFFF",
  borderRadius: 20,
  padding: "32px 28px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 20px 60px rgba(0,0,0,0.08)",
  border: "1px solid #E5E7EB",
};
