import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileListView } from "@/components/mobile/MobileListView";
import type { Task, BoardColumn } from "@/types/domain";

const MOCK_COLUMNS: BoardColumn[] = [
  { id: 1, project_id: 1, name: "Backlog",     color: "#9CA3AF", order: 0 },
  { id: 2, project_id: 1, name: "In Progress", color: "#6366F1", order: 1 },
  { id: 3, project_id: 1, name: "Review",      color: "#D97706", order: 2 },
  { id: 4, project_id: 1, name: "Done",        color: "#059669", order: 3 },
];

const MOCK_TASKS: Task[] = [
  {
    id: 1, project_id: 1, creator_id: 1, assignee_id: 2,
    title: "Fix landing page", description: null,
    column_id: 1, urgency: "MEDIUM",
    deadline: null, created_at: "2025-05-01T00:00:00", updated_at: "2025-05-01T00:00:00",
  },
  {
    id: 2, project_id: 1, creator_id: 1, assignee_id: 1,
    title: "AI draft task", description: "Suggesting some improvements",
    column_id: 1, urgency: "URGENT",
    deadline: null, created_at: "2025-05-01T00:00:00", updated_at: "2025-05-01T00:00:00",
    project: { id: 1, name: "Proj", slug: "p1", color: "#6C63FF" },
  },
  {
    id: 3, project_id: 1, creator_id: 1, assignee_id: 2,
    title: "In Progress Task", description: null,
    column_id: 2, urgency: "LOW",
    deadline: null, created_at: "2025-05-01T00:00:00", updated_at: "2025-05-01T00:00:00",
  },
  {
    id: 4, project_id: 1, creator_id: 1, assignee_id: 2,
    title: "Review Task", description: null,
    column_id: 3, urgency: "HIGH",
    deadline: null, created_at: "2025-05-01T00:00:00", updated_at: "2025-05-01T00:00:00",
  },
];

const MOCK_MEMBERS = [
  { id: 1, full_name: "Manager", email: "m@t.com", role: "OWNER" },
  { id: 2, full_name: "Specialist", email: "s@t.com", role: "ASSIGNEE" },
];

describe("MobileListView", () => {
  it("renders tasks grouped by column tabs", () => {
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
    // Backlog is first tab by default, tasks 1 and 2 are there
    expect(screen.getByText("Fix landing page")).toBeInTheDocument();
  });

  it("calls onApprove when approve button clicked", () => {
    const onApprove = vi.fn();
    render(
      <MobileListView
        tasks={MOCK_TASKS}
        columns={MOCK_COLUMNS}
        role="OWNER"
        members={MOCK_MEMBERS}
        onApprove={onApprove}
        onDelete={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    // Task 1 is in Backlog (first tab), approve button should be visible for OWNER
    fireEvent.click(screen.getByTestId("mobile-approve-1"));
    expect(onApprove).toHaveBeenCalledWith(1);
  });

  it("calls onDelete when discard button clicked", () => {
    const onDelete = vi.fn();
    render(
      <MobileListView
        tasks={MOCK_TASKS}
        columns={MOCK_COLUMNS}
        role="OWNER"
        members={MOCK_MEMBERS}
        onApprove={vi.fn()}
        onDelete={onDelete}
        onAssigneeChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("mobile-discard-1"));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it("switches to second column tab and shows tasks", () => {
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
    fireEvent.click(screen.getByRole("button", { name: /In Progress/i }));
    expect(screen.getByText("In Progress Task")).toBeInTheDocument();
  });
});
