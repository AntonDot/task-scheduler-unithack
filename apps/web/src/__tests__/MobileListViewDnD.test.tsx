import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileListView } from "@/components/mobile/MobileListView";
import { TaskStatus } from "@/types/domain";
import type { Task } from "@/types/domain";

const MOCK_TASKS: Task[] = [
  {
    id: 1,
    project_id: 1,
    creator_id: 1,
    assignee_id: 2,
    title: "Fix landing page",
    description: null,
    status: TaskStatus.TODO,
    urgency: "MEDIUM",
    deadline: null,
    created_at: "2025-05-01T00:00:00",
    updated_at: "2025-05-01T00:00:00",
  },
  {
    id: 2,
    project_id: 1,
    creator_id: 1,
    assignee_id: 1,
    title: "AI draft task",
    description: "Suggesting some improvements",
    status: TaskStatus.AI_DRAFT,
    urgency: "URGENT",
    deadline: null,
    created_at: "2025-05-01T00:00:00",
    updated_at: "2025-05-01T00:00:00",
    project: { id: 1, name: "Proj", slug: "p1", color: "#6C63FF" },
  },
  {
    id: 3,
    project_id: 1,
    creator_id: 1,
    assignee_id: 2,
    title: "In Progress Task",
    description: null,
    status: TaskStatus.IN_PROGRESS,
    urgency: "LOW",
    deadline: null,
    created_at: "2025-05-01T00:00:00",
    updated_at: "2025-05-01T00:00:00",
  },
  {
    id: 4,
    project_id: 1,
    creator_id: 1,
    assignee_id: 2,
    title: "Review Task",
    description: null,
    status: TaskStatus.REVIEW,
    urgency: "HIGH",
    deadline: null,
    created_at: "2025-05-01T00:00:00",
    updated_at: "2025-05-01T00:00:00",
  },
];

const MOCK_MEMBERS = [
  { id: 1, full_name: "Manager", email: "m@t.com", role: "OWNER" },
  { id: 2, full_name: "Specialist", email: "s@t.com", role: "ASSIGNEE" },
];

describe("MobileListView", () => {
  it("renders tasks grouped by status tabs", () => {
    render(
      <MobileListView
        tasks={MOCK_TASKS}
        role="OWNER"
        members={MOCK_MEMBERS}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onStatusChange={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mobile-list-view")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /К выполнению/i }));
    expect(screen.getByText("Fix landing page")).toBeInTheDocument();
  });

  it("calls onApprove for AI draft action", () => {
    const onApprove = vi.fn();
    render(
      <MobileListView
        tasks={MOCK_TASKS}
        role="OWNER"
        members={MOCK_MEMBERS}
        onApprove={onApprove}
        onDelete={vi.fn()}
        onStatusChange={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );

    // AI drafts tab is usually first and active by default
    fireEvent.click(screen.getByTestId("mobile-approve-2"));
    expect(onApprove).toHaveBeenCalledWith(2);
  });

  it("calls onDelete for AI draft action", () => {
    const onDelete = vi.fn();
    render(
      <MobileListView
        tasks={MOCK_TASKS}
        role="OWNER"
        members={MOCK_MEMBERS}
        onApprove={vi.fn()}
        onDelete={onDelete}
        onStatusChange={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("mobile-discard-2"));
    expect(onDelete).toHaveBeenCalledWith(2);
  });

  it("calls onStatusChange for TODO start button", () => {
    const onStatusChange = vi.fn();
    render(
      <MobileListView
        tasks={MOCK_TASKS}
        role="OWNER"
        members={MOCK_MEMBERS}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onStatusChange={onStatusChange}
        onAssigneeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /К выполнению/i }));
    fireEvent.click(screen.getByTestId("mobile-start-1"));
    expect(onStatusChange).toHaveBeenCalledWith(1, TaskStatus.IN_PROGRESS);
  });
});
