import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileActionSheet } from "@/components/mobile/MobileActionSheet";
import { TaskStatus } from "@/types/domain";
import type { Task } from "@/types/domain";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 42,
    project_id: 1,
    creator_id: 1,
    assignee_id: 2,
    title: "Action sheet task",
    description: null,
    status: TaskStatus.TODO,
    urgency: "HIGH",
    deadline: null,
    created_at: "2025-05-01T00:00:00",
    updated_at: "2025-05-01T00:00:00",
    ...overrides,
  };
}

const MEMBERS = [
  { id: 1, full_name: "Иван", email: "i@v.ru", role: "OWNER" as const },
  { id: 2, full_name: "Анна", email: "a@v.ru", role: "ASSIGNEE" as const },
];

describe("MobileActionSheet", () => {
  it("renders task title and status", () => {
    render(
      <MobileActionSheet
        task={makeTask()}
        role="OWNER"
        members={MEMBERS}
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onStatusChange={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Action sheet task")).toBeInTheDocument();
  });

  it("shows start button for TODO task", () => {
    const onStatusChange = vi.fn();
    const onClose = vi.fn();
    render(
      <MobileActionSheet
        task={makeTask({ status: TaskStatus.TODO })}
        role="OWNER"
        members={MEMBERS}
        onClose={onClose}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onStatusChange={onStatusChange}
        onAssigneeChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Начать работу"));
    expect(onStatusChange).toHaveBeenCalledWith(42, TaskStatus.IN_PROGRESS);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows approve and reject for AI_DRAFT when owner", () => {
    const onApprove = vi.fn();
    const onDelete = vi.fn();
    const onClose = vi.fn();
    render(
      <MobileActionSheet
        task={makeTask({ status: TaskStatus.AI_DRAFT })}
        role="OWNER"
        members={MEMBERS}
        onClose={onClose}
        onApprove={onApprove}
        onDelete={onDelete}
        onStatusChange={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Взять в работу"));
    expect(onApprove).toHaveBeenCalledWith(42);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows delete button for owner on non-draft tasks", () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    render(
      <MobileActionSheet
        task={makeTask({ status: TaskStatus.IN_PROGRESS })}
        role="OWNER"
        members={MEMBERS}
        onClose={onClose}
        onApprove={vi.fn()}
        onDelete={onDelete}
        onStatusChange={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Удалить задачу"));
    expect(onDelete).toHaveBeenCalledWith(42);
    expect(onClose).toHaveBeenCalled();
  });

  it("hides delete for assignee", () => {
    render(
      <MobileActionSheet
        task={makeTask({ status: TaskStatus.IN_PROGRESS })}
        role="ASSIGNEE"
        members={MEMBERS}
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onStatusChange={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("Удалить задачу")).not.toBeInTheDocument();
  });

  it("shows assignee selector for owner", () => {
    render(
      <MobileActionSheet
        task={makeTask()}
        role="OWNER"
        members={MEMBERS}
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onStatusChange={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("action-sheet-assignee")).toBeInTheDocument();
  });

  it("hides assignee selector for assignee", () => {
    render(
      <MobileActionSheet
        task={makeTask()}
        role="ASSIGNEE"
        members={MEMBERS}
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onStatusChange={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("action-sheet-assignee")).not.toBeInTheDocument();
  });

  it("calls onAssigneeChange when assignee is changed", () => {
    const onAssigneeChange = vi.fn();
    render(
      <MobileActionSheet
        task={makeTask()}
        role="OWNER"
        members={MEMBERS}
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onStatusChange={vi.fn()}
        onAssigneeChange={onAssigneeChange}
      />,
    );
    const select = screen.getByTestId("action-sheet-assignee");
    fireEvent.change(select, { target: { value: "1" } });
    expect(onAssigneeChange).toHaveBeenCalledWith(42, 1);
  });

  it("closes on cancel button", () => {
    const onClose = vi.fn();
    render(
      <MobileActionSheet
        task={makeTask()}
        role="OWNER"
        members={MEMBERS}
        onClose={onClose}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onStatusChange={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("action-sheet-cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on overlay click", () => {
    const onClose = vi.fn();
    render(
      <MobileActionSheet
        task={makeTask()}
        role="OWNER"
        members={MEMBERS}
        onClose={onClose}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onStatusChange={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("action-sheet"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows review-to-done for owner on REVIEW", () => {
    const onStatusChange = vi.fn();
    render(
      <MobileActionSheet
        task={makeTask({ status: TaskStatus.REVIEW })}
        role="OWNER"
        members={MEMBERS}
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onStatusChange={onStatusChange}
        onAssigneeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Завершить")).toBeInTheDocument();
  });
});
