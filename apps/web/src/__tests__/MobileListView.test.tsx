import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileListView } from "@/components/mobile/MobileListView";
import type { Task, BoardColumn } from "@/types/domain";

const MOCK_COLUMNS: BoardColumn[] = [
  { id: 1, project_id: 1, name: "Backlog",     color: "#9CA3AF", order: 0 },
  { id: 2, project_id: 1, name: "In Progress", color: "#6366F1", order: 1 },
  { id: 3, project_id: 1, name: "Done",        color: "#059669", order: 2 },
];

const MOCK_TASKS: Task[] = [
  {
    id: 1, project_id: 1, creator_id: 1, assignee_id: 2,
    title: "Fix landing page", description: null,
    column_id: 1, urgency: "HIGH",
    deadline: "2025-06-01T00:00:00", created_at: "2025-05-01T00:00:00", updated_at: "2025-05-01T00:00:00",
    project: { id: 1, name: "Онегин Парк", slug: "onegin-park", color: "#6c63ff" },
    assignee: { id: 2, full_name: "Анна Козлова", email: "k@v.ru", is_active: true },
  },
  {
    id: 2, project_id: 1, creator_id: 1, assignee_id: null,
    title: "AI draft task", description: null,
    column_id: 1, urgency: "URGENT",
    deadline: null, created_at: "2025-05-02T00:00:00", updated_at: "2025-05-02T00:00:00",
    project: { id: 1, name: "Онегин Парк", slug: "onegin-park", color: "#6c63ff" },
  },
  {
    id: 3, project_id: 1, creator_id: 1, assignee_id: 1,
    title: "Deploy to staging", description: null,
    column_id: 2, urgency: "MEDIUM",
    deadline: null, created_at: "2025-05-03T00:00:00", updated_at: "2025-05-03T00:00:00",
  },
];

const MOCK_MEMBERS = [
  { id: 1, full_name: "Иван", email: "i@v.ru", role: "OWNER" as const },
  { id: 2, full_name: "Анна", email: "a@v.ru", role: "ASSIGNEE" as const },
];

describe("MobileListView", () => {
  it("renders mobile list view", () => {
    render(
      <MobileListView
        tasks={MOCK_TASKS}
        columns={MOCK_COLUMNS}
        role="OWNER"
        members={MOCK_MEMBERS}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mobile-list-view")).toBeInTheDocument();
  });

  it("renders column tabs", () => {
    render(
      <MobileListView
        tasks={MOCK_TASKS}
        columns={MOCK_COLUMNS}
        role="OWNER"
        members={MOCK_MEMBERS}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("switches tabs and shows corresponding tasks", () => {
    render(
      <MobileListView
        tasks={MOCK_TASKS}
        columns={MOCK_COLUMNS}
        role="OWNER"
        members={MOCK_MEMBERS}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    // Backlog is first tab (default), both task 1 and 2 are there
    expect(screen.getByText("Fix landing page")).toBeInTheDocument();
  });

  it("shows action sheet on long press via context menu", () => {
    render(
      <MobileListView
        tasks={MOCK_TASKS}
        columns={MOCK_COLUMNS}
        role="OWNER"
        members={MOCK_MEMBERS}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    // First tab is Backlog, task 1 is there
    const card = screen.getByTestId("mobile-card-1");
    fireEvent.contextMenu(card);
    expect(screen.getByTestId("action-sheet")).toBeInTheDocument();
  });

  it("closes action sheet on cancel", () => {
    render(
      <MobileListView
        tasks={MOCK_TASKS}
        columns={MOCK_COLUMNS}
        role="OWNER"
        members={MOCK_MEMBERS}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    const card = screen.getByTestId("mobile-card-1");
    fireEvent.contextMenu(card);
    fireEvent.click(screen.getByTestId("action-sheet-cancel"));
    expect(screen.queryByTestId("action-sheet")).not.toBeInTheDocument();
  });
});
