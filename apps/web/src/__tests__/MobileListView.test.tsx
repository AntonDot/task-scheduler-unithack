import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileListView } from "@/components/mobile/MobileListView";
import { MobileTaskCard } from "@/components/mobile/MobileTaskCard";
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

describe("MobileListView", () => {
  it("renders mobile list view", () => {
    render(
      <MobileListView
        tasks={MOCK_TASKS}
        role="OWNER"
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mobile-list-view")).toBeInTheDocument();
  });

  it("renders status tabs", () => {
    render(
      <MobileListView
        tasks={MOCK_TASKS}
        role="OWNER"
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );
    expect(screen.getByText("AI Drafts")).toBeInTheDocument();
    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("switches tabs and shows corresponding tasks", () => {
    render(
      <MobileListView
        tasks={MOCK_TASKS}
        role="OWNER"
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("To Do"));
    expect(screen.getByText("Fix landing page")).toBeInTheDocument();
  });
});

describe("MobileTaskCard", () => {
  it("shows approve button for owner on AI_DRAFT", () => {
    const onApprove = vi.fn();
    render(
      <MobileTaskCard
        task={MOCK_TASKS[1]!}
        role="OWNER"
        onApprove={onApprove}
        onDiscard={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );
    const btn = screen.getByTestId("mobile-approve-2");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("Взять в работу");
    fireEvent.click(btn);
    expect(onApprove).toHaveBeenCalledWith(2);
  });

  it("hides approve button for assignee on AI_DRAFT", () => {
    render(
      <MobileTaskCard
        task={MOCK_TASKS[1]!}
        role="ASSIGNEE"
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("mobile-approve-2")).not.toBeInTheDocument();
  });

  it("shows start button for TODO tasks", () => {
    const onChange = vi.fn();
    render(
      <MobileTaskCard
        task={MOCK_TASKS[0]!}
        role="ASSIGNEE"
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        onStatusChange={onChange}
      />,
    );
    const btn = screen.getByTestId("mobile-start-1");
    expect(btn).toHaveTextContent("Начать");
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith(1, "IN_PROGRESS");
  });

  it("shows urgency badge", () => {
    render(
      <MobileTaskCard
        task={MOCK_TASKS[1]!}
        role="OWNER"
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Срочно")).toBeInTheDocument();
  });

  it("action buttons have minimum 44px touch target", () => {
    render(
      <MobileTaskCard
        task={MOCK_TASKS[1]!}
        role="OWNER"
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );
    const btn = screen.getByTestId("mobile-approve-2");
    expect(btn.classList.contains("mobile-action-btn")).toBe(true);
  });

  it("shows and handles discard button for owner on AI_DRAFT", () => {
    const onDiscard = vi.fn();
    render(
      <MobileTaskCard
        task={MOCK_TASKS[1]!}
        role="OWNER"
        onApprove={vi.fn()}
        onDiscard={onDiscard}
        onStatusChange={vi.fn()}
      />,
    );
    const btn = screen.getByTestId("mobile-discard-2");
    fireEvent.click(btn);
    expect(onDiscard).toHaveBeenCalledWith(2);
  });
});
