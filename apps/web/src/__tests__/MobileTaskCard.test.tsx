import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileTaskCard } from "@/components/mobile/MobileTaskCard";
import { TaskStatus } from "@/types/domain";
import type { Task } from "@/types/domain";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 10,
    project_id: 1,
    creator_id: 1,
    assignee_id: 2,
    title: "Mobile task title",
    description: null,
    status: TaskStatus.TODO,
    urgency: "HIGH",
    deadline: "2025-06-15T00:00:00",
    created_at: "2025-05-01T00:00:00",
    updated_at: "2025-05-01T00:00:00",
    project: { id: 1, name: "Онегин Парк", slug: "onegin-park", color: "#6c63ff" },
    assignee: { id: 2, full_name: "Анна Козлова", email: "k@v.ru", is_active: true },
    ...overrides,
  };
}

function renderCard(
  task: Task,
  overrides: Partial<{
    role: "OWNER" | "ASSIGNEE" | undefined;
    onApprove: ReturnType<typeof vi.fn>;
    onDiscard: ReturnType<typeof vi.fn>;
    onStatusChange: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const props = {
    task,
    role: overrides.role ?? ("OWNER" as const),
    onApprove: overrides.onApprove ?? vi.fn(),
    onDiscard: overrides.onDiscard ?? vi.fn(),
    onStatusChange: overrides.onStatusChange ?? vi.fn(),
  };
  return render(<MobileTaskCard {...props} />);
}

describe("MobileTaskCard", () => {
  it("renders task title", () => {
    renderCard(makeTask());
    expect(screen.getByText("Mobile task title")).toBeInTheDocument();
  });

  it("applies urgency class on card", () => {
    renderCard(makeTask({ urgency: "HIGH" }));
    const card = screen.getByTestId("mobile-card-10");
    expect(card.className).toContain("urgency-high");
  });

  it("shows urgency badge with localized label", () => {
    renderCard(makeTask({ urgency: "URGENT" }));
    expect(screen.getByText("Срочно")).toBeInTheDocument();
  });

  it("shows urgency badge for MEDIUM", () => {
    renderCard(makeTask({ urgency: "MEDIUM" }));
    expect(screen.getByText("Средний")).toBeInTheDocument();
  });

  it("shows urgency badge for LOW", () => {
    renderCard(makeTask({ urgency: "LOW" }));
    expect(screen.getByText("Низкий")).toBeInTheDocument();
  });

  it("shows start button for TODO tasks", () => {
    const onStatusChange = vi.fn();
    renderCard(makeTask({ status: TaskStatus.TODO }), { onStatusChange });
    const btn = screen.getByTestId("mobile-start-10");
    expect(btn).toHaveTextContent("Начать");
  });

  it("calls onStatusChange with IN_PROGRESS when start button clicked", () => {
    const onStatusChange = vi.fn();
    renderCard(makeTask({ status: TaskStatus.TODO }), { onStatusChange });
    fireEvent.click(screen.getByTestId("mobile-start-10"));
    expect(onStatusChange).toHaveBeenCalledWith(10, TaskStatus.IN_PROGRESS);
  });

  it("shows review button for IN_PROGRESS tasks", () => {
    renderCard(makeTask({ status: TaskStatus.IN_PROGRESS }));
    expect(screen.getByText("На проверку")).toBeInTheDocument();
  });

  it("calls onStatusChange with REVIEW when review button clicked", () => {
    const onStatusChange = vi.fn();
    renderCard(makeTask({ status: TaskStatus.IN_PROGRESS }), { onStatusChange });
    fireEvent.click(screen.getByText("На проверку"));
    expect(onStatusChange).toHaveBeenCalledWith(10, TaskStatus.REVIEW);
  });

  it("shows complete button for REVIEW tasks when owner", () => {
    renderCard(makeTask({ status: TaskStatus.REVIEW }), { role: "OWNER" });
    expect(screen.getByText("Завершить")).toBeInTheDocument();
  });

  it("hides complete button for REVIEW tasks when assignee", () => {
    renderCard(makeTask({ status: TaskStatus.REVIEW }), { role: "ASSIGNEE" });
    expect(screen.queryByText("Завершить")).not.toBeInTheDocument();
  });

  it("shows discard button for owner on AI_DRAFT", () => {
    const onDiscard = vi.fn();
    renderCard(makeTask({ status: TaskStatus.AI_DRAFT }), { role: "OWNER", onDiscard });
    const btn = screen.getByTestId("mobile-discard-10");
    expect(btn).toHaveTextContent("Отклонить");
  });

  it("calls onDiscard when discard button clicked", () => {
    const onDiscard = vi.fn();
    renderCard(makeTask({ status: TaskStatus.AI_DRAFT }), { role: "OWNER", onDiscard });
    fireEvent.click(screen.getByTestId("mobile-discard-10"));
    expect(onDiscard).toHaveBeenCalledWith(10);
  });

  it("hides approve and discard buttons for assignee on AI_DRAFT", () => {
    renderCard(makeTask({ status: TaskStatus.AI_DRAFT }), { role: "ASSIGNEE" });
    expect(screen.queryByTestId("mobile-approve-10")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-discard-10")).not.toBeInTheDocument();
  });

  it("shows approve button for owner on AI_DRAFT", () => {
    const onApprove = vi.fn();
    renderCard(makeTask({ status: TaskStatus.AI_DRAFT }), { role: "OWNER", onApprove });
    const btn = screen.getByTestId("mobile-approve-10");
    expect(btn).toHaveTextContent("Взять в работу");
    fireEvent.click(btn);
    expect(onApprove).toHaveBeenCalledWith(10);
  });

  it("does not show any action buttons for DONE tasks", () => {
    renderCard(makeTask({ status: TaskStatus.DONE }), { role: "OWNER" });
    const card = screen.getByTestId("mobile-card-10");
    const buttons = card.querySelectorAll(".mobile-action-btn");
    expect(buttons.length).toBe(0);
  });

  it("shows project tag when project is present", () => {
    renderCard(makeTask());
    expect(screen.getByText("Онегин Парк")).toBeInTheDocument();
  });

  it("shows assignee avatar when assignee is present", () => {
    renderCard(makeTask());
    expect(screen.getByTitle("Анна Козлова")).toBeInTheDocument();
  });
});
