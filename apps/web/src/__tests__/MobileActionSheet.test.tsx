import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileActionSheet } from "@/components/mobile/MobileActionSheet";
import type { Task } from "@/types/domain";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 42,
    project_id: 1,
    creator_id: 1,
    assignee_id: 2,
    title: "Action sheet task",
    description: null,
    column_id: 1,
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
  it("renders task title", () => {
    render(
      <MobileActionSheet
        task={makeTask()}
        role="OWNER"
        members={MEMBERS}
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Action sheet task")).toBeInTheDocument();
  });

  it("shows approve button for owner", () => {
    const onApprove = vi.fn();
    const onClose = vi.fn();
    render(
      <MobileActionSheet
        task={makeTask()}
        role="OWNER"
        members={MEMBERS}
        onClose={onClose}
        onApprove={onApprove}
        onDelete={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Взять в работу"));
    expect(onApprove).toHaveBeenCalledWith(42);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows delete button for owner", () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    render(
      <MobileActionSheet
        task={makeTask()}
        role="OWNER"
        members={MEMBERS}
        onClose={onClose}
        onApprove={vi.fn()}
        onDelete={onDelete}
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
        task={makeTask()}
        role="ASSIGNEE"
        members={MEMBERS}
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onDelete={vi.fn()}
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
        onAssigneeChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("action-sheet"));
    expect(onClose).toHaveBeenCalled();
  });
});
