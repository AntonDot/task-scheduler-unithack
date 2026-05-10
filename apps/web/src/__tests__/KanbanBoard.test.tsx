import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { ThemeProvider } from "@/theme/ThemeContext";
import { TaskStatus } from "@/types/domain";
import { COLUMNS_DEF, createTheme } from "@/theme/theme";
import type { Task } from "@/types/domain";

// Mock BlockEditor to avoid ESM issues in vitest
vi.mock("@/components/editor/BlockEditor", () => ({
  BlockEditor: ({ value }: { value: string }) => (
    <div data-testid="block-editor">{value}</div>
  ),
}));

const lightTheme = createTheme(false);

const MOCK_TASKS: Task[] = [
  {
    id: 1, project_id: 1, creator_id: 1, assignee_id: 2,
    title: "Fix landing page", description: "Broken layout",
    status: TaskStatus.TODO, urgency: "HIGH",
    deadline: "2025-06-01T00:00:00", created_at: "2025-05-01T00:00:00", updated_at: "2025-05-01T00:00:00",
    project: { id: 1, name: "Онегин Парк", slug: "onegin-park", color: "#6c63ff" },
    assignee: { id: 2, full_name: "Анна Козлова", email: "kozlova@victory.ru", is_active: true },
  },
  {
    id: 2, project_id: 1, creator_id: 1, assignee_id: null,
    title: "AI draft review response", description: null,
    status: TaskStatus.AI_DRAFT, urgency: "URGENT",
    deadline: null, created_at: "2025-05-02T00:00:00", updated_at: "2025-05-02T00:00:00",
    project: { id: 1, name: "Онегин Парк", slug: "onegin-park", color: "#6c63ff" },
  },
  {
    id: 3, project_id: 1, creator_id: 1, assignee_id: 2,
    title: "Deploy to staging", description: null,
    status: TaskStatus.IN_PROGRESS, urgency: "MEDIUM",
    deadline: null, created_at: "2025-05-03T00:00:00", updated_at: "2025-05-03T00:00:00",
  },
  {
    id: 4, project_id: 1, creator_id: 1, assignee_id: 1,
    title: "Code review auth module", description: null,
    status: TaskStatus.REVIEW, urgency: "LOW",
    deadline: null, created_at: "2025-05-03T00:00:00", updated_at: "2025-05-03T00:00:00",
  },
  {
    id: 5, project_id: 1, creator_id: 1, assignee_id: 1,
    title: "Setup CI pipeline", description: null,
    status: TaskStatus.DONE, urgency: "LOW",
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
    members: MOCK_MEMBERS,
    onStatusChange: vi.fn(),
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
    for (const col of COLUMNS_DEF) {
      expect(screen.getByTestId(`column-${col.id}`)).toBeInTheDocument();
    }
  });

  it("displays column labels", () => {
    renderBoard();
    for (const col of COLUMNS_DEF) {
      expect(screen.getByText(col.label.toUpperCase())).toBeInTheDocument();
    }
  });

  it("renders task cards in correct columns — TODO maps to backlog", () => {
    renderBoard();
    const backlogCol = screen.getByTestId("column-backlog");
    expect(backlogCol).toHaveTextContent("Fix landing page");
  });

  it("renders task cards in correct columns — AI_DRAFT maps to backlog", () => {
    renderBoard();
    const backlogCol = screen.getByTestId("column-backlog");
    expect(backlogCol).toHaveTextContent("AI draft review response");
  });

  it("renders IN_PROGRESS task in in-progress column", () => {
    renderBoard();
    const col = screen.getByTestId("column-in-progress");
    expect(col).toHaveTextContent("Deploy to staging");
  });

  it("renders REVIEW task in review column", () => {
    renderBoard();
    const col = screen.getByTestId("column-review");
    expect(col).toHaveTextContent("Code review auth module");
  });

  it("renders DONE task in done column", () => {
    renderBoard();
    const col = screen.getByTestId("column-done");
    expect(col).toHaveTextContent("Setup CI pipeline");
  });

  it("shows task title on card", () => {
    renderBoard();
    expect(screen.getByText("Fix landing page")).toBeInTheDocument();
  });

  it("shows project tag on card", () => {
    renderBoard();
    const tags = screen.getAllByText("Онегин Парк");
    expect(tags.length).toBeGreaterThan(0);
  });

  it("shows assignee avatar initials", () => {
    renderBoard();
    expect(screen.getByTitle("Анна Козлова")).toBeInTheDocument();
  });
});
