import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { KANBAN_COLUMNS, COLUMN_LABELS, TaskStatus } from "@/types/domain";
import type { Task } from "@/types/domain";

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
    role: "OWNER" as const,
    currentUserId: 1,
    members: MOCK_MEMBERS,
    onStatusChange: vi.fn(),
    onApprove: vi.fn(),
    onDelete: vi.fn(),
    onAssigneeChange: vi.fn(),
    showOnlyMine: false,
  };
  return render(<KanbanBoard {...defaultProps} {...overrides} />);
}

describe("KanbanBoard", () => {
  it("renders all five columns", () => {
    renderBoard();
    for (const status of KANBAN_COLUMNS) {
      expect(screen.getByTestId(`column-${status}`)).toBeInTheDocument();
    }
  });

  it("displays column labels", () => {
    renderBoard();
    for (const label of Object.values(COLUMN_LABELS)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders task cards in correct columns", () => {
    renderBoard();
    const todoCol = screen.getByTestId("column-TODO");
    expect(todoCol).toHaveTextContent("Fix landing page");

    const draftCol = screen.getByTestId("column-AI_DRAFT");
    expect(draftCol).toHaveTextContent("AI draft review response");
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

  it("filters tasks by current user when showOnlyMine=true", () => {
    renderBoard({ showOnlyMine: true, currentUserId: 2 });
    expect(screen.getByText("Fix landing page")).toBeInTheDocument();
    expect(screen.getByText("Deploy to staging")).toBeInTheDocument();
    expect(screen.queryByText("Setup CI pipeline")).not.toBeInTheDocument();
  });
});
