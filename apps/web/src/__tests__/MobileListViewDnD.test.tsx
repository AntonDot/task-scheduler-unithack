import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileListView } from "@/components/mobile/MobileListView";
import { TaskStatus } from "@/types/domain";
import type { Task } from "@/types/domain";

const MOCK_TASKS: Task[] = [
  {
    id: 1, project_id: 1, creator_id: 1, assignee_id: 2,
    title: "Fix landing page", description: null,
    status: TaskStatus.TODO, urgency: "HIGH",
    deadline: "2025-06-01T00:00:00", created_at: "2025-05-01T00:00:00", updated_at: "2025-05-01T00:00:00",
    project: { id: 1, name: "Proj", slug: "proj", color: "#6c63ff" },
    assignee: { id: 2, full_name: "Anna K", email: "a@v.ru", is_active: true },
  },
  {
    id: 2, project_id: 1, creator_id: 1, assignee_id: null,
    title: "AI draft task", description: null,
    status: TaskStatus.AI_DRAFT, urgency: "URGENT",
    deadline: null, created_at: "2025-05-02T00:00:00", updated_at: "2025-05-02T00:00:00",
    project: { id: 1, name: "Proj", slug: "proj", color: "#6c63ff" },
  },
  {
    id: 3, project_id: 1, creator_id: 1, assignee_id: 1,
    title: "Deploy staging", description: null,
    status: TaskStatus.IN_PROGRESS, urgency: "MEDIUM",
    deadline: null, created_at: "2025-05-03T00:00:00", updated_at: "2025-05-03T00:00:00",
  },
  {
    id: 4, project_id: 1, creator_id: 1, assignee_id: 1,
    title: "Review PR", description: null,
    status: TaskStatus.REVIEW, urgency: "LOW",
    deadline: null, created_at: "2025-05-04T00:00:00", updated_at: "2025-05-04T00:00:00",
  },
];

const MOCK_MEMBERS = [
  { id: 1, full_name: "Иван", email: "i@v.ru", role: "OWNER" as const },
  { id: 2, full_name: "Anna K", email: "a@v.ru", role: "ASSIGNEE" as const },
];

describe("MobileListView", () => {
  it("shows AI draft tasks in the default tab", () => {
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

    expect(screen.getByText("AI draft task")).toBeInTheDocument();
    expect(screen.queryByText("Fix landing page")).not.toBeInTheDocument();
  });

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
    fireEvent.click(screen.getByText("To Do"));
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

    fireEvent.click(screen.getByTestId("mobile-approve-2"));
    expect(onApprove).toHaveBeenCalledWith(2);
  });

  it("calls onDelete for AI draft discard action", () => {
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

    fireEvent.click(screen.getByText("To Do"));
    fireEvent.click(screen.getByTestId("mobile-start-1"));
    expect(onStatusChange).toHaveBeenCalledWith(1, TaskStatus.IN_PROGRESS);
  });
});
