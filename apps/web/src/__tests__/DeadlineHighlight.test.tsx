import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { TaskCard } from "@/components/kanban/TaskCard";
import { MobileTaskCard } from "@/components/mobile/MobileTaskCard";
import { TaskStatus } from "@/types/domain";
import type { Task } from "@/types/domain";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    project_id: 1,
    creator_id: 1,
    assignee_id: 2,
    title: "Test task",
    description: null,
    status: TaskStatus.TODO,
    urgency: "MEDIUM",
    deadline: null,
    created_at: "2025-05-01T00:00:00",
    updated_at: "2025-05-01T00:00:00",
    ...overrides,
  };
}

function renderTaskCard(task: Task) {
  return render(
    <DndContext>
      <SortableContext items={[`task-${task.id}`]}>
        <TaskCard task={task} onSelect={vi.fn()} />
      </SortableContext>
    </DndContext>,
  );
}

function renderMobileCard(task: Task) {
  return render(
    <MobileTaskCard
      task={task}
      role="OWNER"
      onApprove={vi.fn()}
      onDelete={vi.fn()}
      onStatusChange={vi.fn()}
    />,
  );
}

describe("Deadline highlights — TaskCard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("overdue task gets overdue class", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    const task = makeTask({ deadline: "2025-06-10T00:00:00Z" });
    renderTaskCard(task);
    const card = screen.getByTestId("task-card-1");
    expect(card.className).toContain("task-card--overdue");
    vi.useRealTimers();
  });

  it("due-soon task gets due-soon class", () => {
    vi.useFakeTimers();
    // Deadline 12 hours from now
    const now = new Date("2025-06-15T12:00:00Z");
    vi.setSystemTime(now);
    const deadline = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
    const task = makeTask({ deadline });
    renderTaskCard(task);
    const card = screen.getByTestId("task-card-1");
    expect(card.className).toContain("task-card--due-soon");
    vi.useRealTimers();
  });

  it("future deadline shows no special class", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    // Deadline 7 days from now
    const deadline = new Date("2025-06-22T12:00:00Z").toISOString();
    const task = makeTask({ deadline });
    renderTaskCard(task);
    const card = screen.getByTestId("task-card-1");
    expect(card.className).not.toContain("task-card--overdue");
    expect(card.className).not.toContain("task-card--due-soon");
    vi.useRealTimers();
  });

  it("displays relative deadline text for overdue", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    const task = makeTask({ deadline: "2025-06-14T12:00:00Z" });
    renderTaskCard(task);
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("displays relative deadline text for due-soon", () => {
    vi.useFakeTimers();
    const now = new Date("2025-06-15T12:00:00Z");
    vi.setSystemTime(now);
    const deadline = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
    const task = makeTask({ deadline });
    renderTaskCard(task);
    expect(screen.getByText(/left/i)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("no deadline means no special class", () => {
    const task = makeTask({ deadline: null });
    renderTaskCard(task);
    const card = screen.getByTestId("task-card-1");
    expect(card.className).not.toContain("task-card--overdue");
    expect(card.className).not.toContain("task-card--due-soon");
  });
});

describe("Deadline highlights — MobileTaskCard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("overdue mobile task gets overdue class", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    const task = makeTask({ id: 10, deadline: "2025-06-10T00:00:00Z" });
    renderMobileCard(task);
    const card = screen.getByTestId("mobile-card-10");
    expect(card.className).toContain("mobile-card--overdue");
  });

  it("due-soon mobile task gets due-soon class", () => {
    vi.useFakeTimers();
    const now = new Date("2025-06-15T12:00:00Z");
    vi.setSystemTime(now);
    const deadline = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
    const task = makeTask({ id: 10, deadline });
    renderMobileCard(task);
    const card = screen.getByTestId("mobile-card-10");
    expect(card.className).toContain("mobile-card--due-soon");
  });

  it("future deadline mobile card shows no special class", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    const deadline = new Date("2025-06-22T12:00:00Z").toISOString();
    const task = makeTask({ id: 10, deadline });
    renderMobileCard(task);
    const card = screen.getByTestId("mobile-card-10");
    expect(card.className).not.toContain("mobile-card--overdue");
    expect(card.className).not.toContain("mobile-card--due-soon");
  });

  it("displays relative deadline text in mobile card", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    const task = makeTask({ id: 10, deadline: "2025-06-14T12:00:00Z" });
    renderMobileCard(task);
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });
});
