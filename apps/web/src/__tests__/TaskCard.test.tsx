import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { TaskCard } from "@/components/kanban/TaskCard";
import type { Task } from "@/types/domain";
import { TaskStatus } from "@/types/domain";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    project_id: 1,
    creator_id: 1,
    assignee_id: 2,
    title: "Fix landing page",
    description: "Broken layout",
    status: TaskStatus.TODO,
    urgency: "HIGH",
    deadline: "2025-06-01T00:00:00",
    created_at: "2025-05-01T00:00:00",
    updated_at: "2025-05-01T00:00:00",
    project: { id: 1, name: "Онегин Парк", slug: "onegin-park", color: "#6c63ff" },
    assignee: { id: 2, full_name: "Анна Козлова", email: "k@v.ru", is_active: true },
    ...overrides,
  };
}

function renderTaskCard(task: Task, onSelect = vi.fn()) {
  return render(
    <DndContext>
      <SortableContext items={[`task-${task.id}`]}>
        <TaskCard task={task} onSelect={onSelect} />
      </SortableContext>
    </DndContext>,
  );
}

describe("TaskCard", () => {
  it("renders task title", () => {
    renderTaskCard(makeTask());
    expect(screen.getByText("Fix landing page")).toBeInTheDocument();
  });

  it("applies urgency-high class", () => {
    renderTaskCard(makeTask({ urgency: "HIGH" }));
    const card = screen.getByTestId("task-card-1");
    expect(card.className).toContain("urgency-high");
  });

  it("applies urgency-urgent class", () => {
    renderTaskCard(makeTask({ urgency: "URGENT" }));
    const card = screen.getByTestId("task-card-1");
    expect(card.className).toContain("urgency-urgent");
  });

  it("applies urgency-low class", () => {
    renderTaskCard(makeTask({ urgency: "LOW" }));
    const card = screen.getByTestId("task-card-1");
    expect(card.className).toContain("urgency-low");
  });

  it("applies urgency-medium class", () => {
    renderTaskCard(makeTask({ urgency: "MEDIUM" }));
    const card = screen.getByTestId("task-card-1");
    expect(card.className).toContain("urgency-medium");
  });

  it("shows project tag when project is present", () => {
    renderTaskCard(makeTask());
    expect(screen.getByText("Онегин Парк")).toBeInTheDocument();
    const tag = screen.getByText("Онегин Парк");
    expect(tag.className).toContain("task-card__project-tag");
  });

  it("shows assignee avatar when assignee is present", () => {
    renderTaskCard(makeTask());
    expect(screen.getByTitle("Анна Козлова")).toBeInTheDocument();
    expect(screen.getByText("АК")).toBeInTheDocument();
  });

  it("handles missing assignee gracefully", () => {
    const task = makeTask({ assignee_id: null, assignee: undefined });
    renderTaskCard(task);
    expect(screen.getByText("Fix landing page")).toBeInTheDocument();
    expect(screen.queryByTitle("Анна Козлова")).not.toBeInTheDocument();
  });

  it("handles missing project gracefully", () => {
    const task = makeTask({ project: undefined });
    renderTaskCard(task);
    expect(screen.getByText("Fix landing page")).toBeInTheDocument();
    expect(screen.queryByText("Онегин Парк")).not.toBeInTheDocument();
  });

  it("calls onSelect when card is clicked", () => {
    const onSelect = vi.fn();
    const task = makeTask();
    renderTaskCard(task, onSelect);
    fireEvent.click(screen.getByTestId("task-card-1"));
    expect(onSelect).toHaveBeenCalledWith(task);
  });

  it("shows deadline when present", () => {
    renderTaskCard(makeTask({ deadline: "2025-06-01T00:00:00" }));
    const card = screen.getByTestId("task-card-1");
    const deadlineEl = card.querySelector(".task-card__deadline");
    expect(deadlineEl).not.toBeNull();
  });

  it("hides deadline when null", () => {
    renderTaskCard(makeTask({ deadline: null }));
    const card = screen.getByTestId("task-card-1");
    const deadlineEl = card.querySelector(".task-card__deadline");
    expect(deadlineEl).toBeNull();
  });
});
