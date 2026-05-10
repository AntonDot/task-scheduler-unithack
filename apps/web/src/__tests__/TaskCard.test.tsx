import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TaskCard } from "@/components/kanban/TaskCard";
import { ThemeProvider } from "@/theme/ThemeContext";
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
    <ThemeProvider>
      <TaskCard task={task} onSelect={onSelect} />
    </ThemeProvider>,
  );
}

describe("TaskCard", () => {
  it("renders task title", () => {
    renderTaskCard(makeTask());
    expect(screen.getByText("Fix landing page")).toBeInTheDocument();
  });

  it("renders urgency badge with label for HIGH", () => {
    renderTaskCard(makeTask({ urgency: "HIGH" }));
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("renders urgent urgency badge", () => {
    renderTaskCard(makeTask({ urgency: "URGENT" }));
    expect(screen.getByText("Urgent")).toBeInTheDocument();
  });

  it("renders low urgency badge", () => {
    renderTaskCard(makeTask({ urgency: "LOW" }));
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("renders medium urgency badge", () => {
    renderTaskCard(makeTask({ urgency: "MEDIUM" }));
    expect(screen.getByText("Medium")).toBeInTheDocument();
  });

  it("shows project tag when project is present", () => {
    renderTaskCard(makeTask());
    expect(screen.getByText("Онегин Парк")).toBeInTheDocument();
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

  it("has urgency stripe via borderLeft style", () => {
    renderTaskCard(makeTask({ urgency: "URGENT" }));
    const card = screen.getByTestId("task-card-1");
    // Browser normalizes hex to rgb in computed styles
    expect(card.style.borderLeft).toContain("rgb(239, 68, 68)");
  });
});
