import { useState, useEffect } from "react";
import { getLoginMode } from "@/api/auth";

interface LoginPageProps {
  onLogin: (email: string, password?: string) => Promise<void>;
}

const DEMO_USERS = [
  { email: "d.morozov@victorygroup.ru", name: "Дмитрий Морозов", role: "Owner" },
  { email: "a.kozlova@victorygroup.ru", name: "Анна Козлова", role: "Assignee" },
  { email: "i.petrov@victorygroup.ru", name: "Игорь Петров", role: "Assignee" },
];

export function LoginPage({ onLogin }: LoginPageProps) {
  const [devMode, setDevMode] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  if (devMode === null) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-loading">Загрузка...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Victory Group</h1>
          <p className="login-subtitle">Task Scheduler</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        {devMode ? (
          <>
            <p className="login-mode-label">Dev Mode — Quick Login</p>
            <div className="login-users">
              {DEMO_USERS.map((u) => (
                <button
                  key={u.email}
                  className="login-user-btn"
                  disabled={loading}
                  onClick={() => handleDemoLogin(u.email)}
                >
                  <div className="login-user-avatar">
                    {u.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
                  </div>
                  <div className="login-user-info">
                    <span className="login-user-name">{u.name}</span>
                    <span className="login-user-role">{u.role}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>
            <div className="login-field">
              <label htmlFor="password">Пароль</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>
            <button type="submit" className="btn btn--primary login-submit" disabled={loading}>
              {loading ? "Вход..." : "Войти"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
