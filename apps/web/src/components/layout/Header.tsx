import type { Project, User } from "@/types/domain";
import { Avatar } from "../kanban/Avatar";

export type AppView = "kanban" | "dashboard";

interface HeaderProps {
  user: User;
  projects: Project[];
  selectedProjectId: number | null;
  onSelectProject: (id: number) => void;
  showOnlyMine: boolean;
  onToggleMine: () => void;
  onLogout: () => void;
  onAddTask?: () => void;
  currentView?: AppView;
  onViewChange?: (view: AppView) => void;
}

export function Header({
  user,
  projects,
  selectedProjectId,
  onSelectProject,
  showOnlyMine,
  onToggleMine,
  onLogout,
  onAddTask,
  currentView,
  onViewChange,
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
        {onViewChange && (
          <div className="header__view-toggle">
            <button
              className={`header__view-btn ${currentView === "kanban" ? "active" : ""}`}
              onClick={() => onViewChange("kanban")}
            >
              Kanban
            </button>
            <button
              className={`header__view-btn ${currentView === "dashboard" ? "active" : ""}`}
              onClick={() => onViewChange("dashboard")}
            >
              Dashboard
            </button>
          </div>
        )}
      </div>
      <div className="header__right">
        {onAddTask && (
          <button className="header__add-btn" onClick={onAddTask}>
            + New Task
          </button>
        )}
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
