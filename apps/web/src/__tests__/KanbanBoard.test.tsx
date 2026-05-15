import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { ThemeProvider } from "@/theme/ThemeContext";
import { createTheme } from "@/theme/theme";
import type { Task, BoardColumn } from "@/types/domain";

// Mock BlockEditor to avoid ESM issues in vitest
vi.mock("@/components/editor/BlockEditor", () => ({
  BlockEditor: ({ value }: { value: string }) => (
    <div data-testid="block-editor">{value}</div>
  ),
}));

// Mock fetch for TaskDrawer
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: true, status: 200, json: () => Promise.resolve([]),
}));

const lightTheme = createTheme(false);

// Replicate 4 default columns with IDs 1-4
const MOCK_COLUMNS: BoardColumn[] = [
  { id: 1, project_id: 1, name: "Backlog",     color: "#9CA3AF", order: 0 },
  { id: 2, project_id: 1, name: "In Progress", color: "#6366F1", order: 1 },
  { id: 3, project_id: 1, name: "In Review",   color: "#D97706", order: 2 },
  { id: 4, project_id: 1, name: "Done",        color: "#059669", order: 3 },
];

const MOCK_TASKS: Task[] = [
  {
    id: 1, project_id: 1, creator_id: 1, assignee_id: 2,
    title: "Fix landing page", description: "Broken layout",
    column_id: 1, urgency: "HIGH",
    deadline: "2025-06-01T00:00:00", created_at: "2025-05-01T00:00:00", updated_at: "2025-05-01T00:00:00",
    project: { id: 1, name: "Онегин Парк", slug: "onegin-park", color: "#6c63ff" },
    assignee: { id: 2, full_name: "Анна Козлова", email: "kozlova@victory.ru", is_active: true },
  },
  {
    id: 2, project_id: 1, creator_id: 1, assignee_id: null,
    title: "AI draft review response", description: null,
    column_id: 1, urgency: "URGENT",
    deadline: null, created_at: "2025-05-02T00:00:00", updated_at: "2025-05-02T00:00:00",
    project: { id: 1, name: "Онегин Парк", slug: "onegin-park", color: "#6c63ff" },
  },
  {
    id: 3, project_id: 1, creator_id: 1, assignee_id: 2,
    title: "Deploy to staging", description: null,
    column_id: 2, urgency: "MEDIUM",
    deadline: null, created_at: "2025-05-03T00:00:00", updated_at: "2025-05-03T00:00:00",
  },
  {
    id: 4, project_id: 1, creator_id: 1, assignee_id: 1,
    title: "Code review auth module", description: null,
    column_id: 3, urgency: "LOW",
    deadline: null, created_at: "2025-05-03T00:00:00", updated_at: "2025-05-03T00:00:00",
  },
  {
    id: 5, project_id: 1, creator_id: 1, assignee_id: 1,
    title: "Setup CI pipeline", description: null,
    column_id: 4, urgency: "LOW",
    deadline: null, created_at: "2025-05-03T00:00:00", updated_at: "2025-05-03T00:00:00",
  },
];

const MOCK_MEMBERS = [
  { id: 1, full_name: "Дмитрий Морозов", email: "d.morozov@victory.ru", role: "OWNER" },
  { id: 2, full_name: "Анна Козлова", email: "kozlova@victory.ru", role: "ASSIGNEE" },
];

function renderBoard(overrides: Partial<Parameters<typeof KanbanBoard>[0]> = {}) {
  const defaultProps = {
    tasks: MOCK_TASKS,
    columns: MOCK_COLUMNS,
    members: MOCK_MEMBERS,
    onColumnChange: vi.fn(),
    onUpdate: vi.fn(),
    accent: "#6366F1",
    compact: false,
    colWidth: 300,
    theme: lightTheme,
  };
  return render(
    <ThemeProvider>
      <KanbanBoard {...defaultProps} {...overrides} />
    </ThemeProvider>,
  );
}

describe("KanbanBoard", () => {
  it("renders all four design columns", () => {
    renderBoard();
    for (const col of MOCK_COLUMNS) {
      expect(screen.getByTestId(`column-${col.id}`)).toBeInTheDocument();
    }
  });

  it("displays column names", () => {
    renderBoard();
    for (const col of MOCK_COLUMNS) {
      expect(screen.getByText(col.name)).toBeInTheDocument();
    }
  });

  it("renders task cards in correct columns — backlog", () => {
    renderBoard();
    const backlogCol = screen.getByTestId("column-1");
    expect(backlogCol).toHaveTextContent("Fix landing page");
  });

  it("renders task cards in correct columns — AI_DRAFT in backlog", () => {
    renderBoard();
    const backlogCol = screen.getByTestId("column-1");
    expect(backlogCol).toHaveTextContent("AI draft review response");
  });

  it("renders in-progress task in in-progress column", () => {
    renderBoard();
    const col = screen.getByTestId("column-2");
    expect(col).toHaveTextContent("Deploy to staging");
  });

  it("renders review task in review column", () => {
    renderBoard();
    const col = screen.getByTestId("column-3");
    expect(col).toHaveTextContent("Code review auth module");
  });

  it("renders done task in done column", () => {
    renderBoard();
    const col = screen.getByTestId("column-4");
    expect(col).toHaveTextContent("Setup CI pipeline");
  });

  it("shows task title on card", () => {
    renderBoard();
    expect(screen.getByText("Fix landing page")).toBeInTheDocument();
  });

  it("renders task card content for tasks with a project", () => {
    renderBoard();
    expect(screen.getByTestId("task-card-1")).toBeInTheDocument();
    expect(screen.getByText("Fix landing page")).toBeInTheDocument();
  });

  it("shows assignee avatar initials", () => {
    renderBoard();
    expect(screen.getByTitle("Анна Козлова")).toBeInTheDocument();
  });
});
