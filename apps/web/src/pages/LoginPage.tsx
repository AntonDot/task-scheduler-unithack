import { useState } from "react";

interface LoginPageProps {
  onLogin: (email: string) => Promise<void>;
}

const DEMO_USERS = [
  { email: "d.morozov@victorygroup.ru", name: "Дмитрий Морозов (Owner)" },
  { email: "a.kozlova@victorygroup.ru", name: "Анна Козлова (Assignee)" },
  { email: "i.petrov@victorygroup.ru", name: "Игорь Петров (Assignee)" },
];

export function LoginPage({ onLogin }: LoginPageProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (email: string) => {
    setLoading(true);
    setError("");
    try {
      await onLogin(email);
    } catch {
      setError("Login failed. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Victory Group</h1>
        <p className="text-muted">Task Scheduler — Demo Login</p>
        {error && <p className="error-text">{error}</p>}
        <div className="login-users">
          {DEMO_USERS.map((u) => (
            <button
              key={u.email}
              className="btn btn--primary login-btn"
              disabled={loading}
              onClick={() => handleLogin(u.email)}
            >
              {u.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
