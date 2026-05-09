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
    project: { id: 1, name: "Онегин Парк", slug: "onegin-park", color: "#6c63ff" },
    assignee: { id: 2, full_name: "Анна Козлова", email: "k@v.ru", is_active: true },
  },
  {
    id: 2, project_id: 1, creator_id: 1, assignee_id: null,
    title: "AI draft task", description: null,
    status: TaskStatus.AI_DRAFT, urgency: "URGENT",
    deadline: null, created_at: "2025-05-02T00:00:00", updated_at: "2025-05-02T00:00:00",
    project: { id: 1, name: "Онегин Парк", slug: "onegin-park", color: "#6c63ff" },
  },
  {
    id: 3, project_id: 1, creator_id: 1, assignee_id: 1,
    title: "Deploy to staging", description: null,
    status: TaskStatus.IN_PROGRESS, urgency: "MEDIUM",
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
        role="OWNER"
        members={MOCK_MEMBERS}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onStatusChange={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mobile-list-view")).toBeInTheDocument();
  });

  it("renders status tabs", () => {
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
    expect(screen.getByText(/AI Черновики/i)).toBeInTheDocument();
    expect(screen.getByText(/К выполнению/i)).toBeInTheDocument();
    expect(screen.getByText(/В работе/i)).toBeInTheDocument();
  });

  it("switches tabs and shows corresponding tasks", () => {
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
    fireEvent.click(screen.getByRole("button", { name: /К выполнению/i }));
    expect(screen.getByText("Fix landing page")).toBeInTheDocument();
  });

  it("shows action sheet on long press via context menu", () => {
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
    // Switch to TODO tab and trigger context menu on the task card
    fireEvent.click(screen.getByRole("button", { name: /К выполнению/i }));
    const card = screen.getByTestId("mobile-card-1");
    fireEvent.contextMenu(card);
    expect(screen.getByTestId("action-sheet")).toBeInTheDocument();
  });

  it("closes action sheet on cancel", () => {
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
    fireEvent.click(screen.getByRole("button", { name: /К выполнению/i }));
    const card = screen.getByTestId("mobile-card-1");
    fireEvent.contextMenu(card);
    fireEvent.click(screen.getByTestId("action-sheet-cancel"));
    expect(screen.queryByTestId("action-sheet")).not.toBeInTheDocument();
  });
});
