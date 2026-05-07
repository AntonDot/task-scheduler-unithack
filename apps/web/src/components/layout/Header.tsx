import type { Project, User } from "@/types/domain";
import { Avatar } from "../kanban/Avatar";

interface HeaderProps {
  user: User;
  projects: Project[];
  selectedProjectId: number | null;
  onSelectProject: (id: number) => void;
  showOnlyMine: boolean;
  onToggleMine: () => void;
  onLogout: () => void;
}

export function Header({
  user,
  projects,
  selectedProjectId,
  onSelectProject,
  showOnlyMine,
  onToggleMine,
  onLogout,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="header__left">
        <h1 className="header__logo">Victory Group</h1>
        <nav className="header__projects">
          {projects.map((p) => (
            <button
              key={p.id}
              className={`header__project-btn ${selectedProjectId === p.id ? "active" : ""}`}
              style={{ borderColor: p.color }}
              onClick={() => onSelectProject(p.id)}
            >
              {p.name}
            </button>
          ))}
        </nav>
      </div>
      <div className="header__right">
        <label className="header__filter">
          <input type="checkbox" checked={showOnlyMine} onChange={onToggleMine} />
          Only my tasks
        </label>
        <div className="header__user">
          <Avatar name={user.full_name} size={32} />
          <span>{user.full_name}</span>
        </div>
        <button className="btn btn--ghost" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}
