import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TaskDrawer } from "@/components/kanban/TaskDrawer";
import { TaskStatus } from "@/types/domain";
import type { Task } from "@/types/domain";

// Mock fetch for comments
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: () => Promise.resolve([]),
}));

const BASE_TASK: Task = {
  id: 10, project_id: 1, creator_id: 1, assignee_id: 2,
  title: "Test task", description: "Some description",
  status: TaskStatus.AI_DRAFT, urgency: "HIGH",
  deadline: "2025-06-01T00:00:00", created_at: "2025-05-01T00:00:00", updated_at: "2025-05-01T00:00:00",
  assignee: { id: 2, full_name: "Test User", email: "test@test.com", is_active: true },
};

const MOCK_MEMBERS = [
  { id: 1, full_name: "Дмитрий Морозов", email: "d.morozov@victory.ru", role: "OWNER" },
  { id: 2, full_name: "Test User", email: "test@test.com", role: "ASSIGNEE" },
];

function renderDrawer(overrides: { task?: Partial<Task>; role?: string } = {}) {
  const task = { ...BASE_TASK, ...overrides.task } as Task;
  const props = {
    task,
    role: (overrides.role ?? "OWNER") as "OWNER" | "ASSIGNEE",
    members: MOCK_MEMBERS,
    onClose: vi.fn(),
    onApprove: vi.fn(),
    onDelete: vi.fn(),
    onStatusChange: vi.fn(),
    onAssigneeChange: vi.fn(),
  };
  const result = render(<TaskDrawer {...props} />);
  return { ...result, ...props };
}

describe("TaskDrawer", () => {
  it("shows task title and description", () => {
    renderDrawer();
    expect(screen.getByText("Test task")).toBeInTheDocument();
    expect(screen.getByText("Some description")).toBeInTheDocument();
  });

  it("shows approve button for owner on AI_DRAFT", () => {
    renderDrawer({ role: "OWNER", task: { status: TaskStatus.AI_DRAFT } });
    expect(screen.getByTestId("approve-btn")).toBeInTheDocument();
  });

  it("hides approve button for assignee", () => {
    renderDrawer({ role: "ASSIGNEE", task: { status: TaskStatus.AI_DRAFT } });
    expect(screen.queryByTestId("approve-btn")).not.toBeInTheDocument();
  });

  it("hides approve button when status is not AI_DRAFT", () => {
    renderDrawer({ role: "OWNER", task: { status: TaskStatus.TODO } });
    expect(screen.queryByTestId("approve-btn")).not.toBeInTheDocument();
  });

  it("calls onApprove when approve button clicked", () => {
    const { onApprove } = renderDrawer({ role: "OWNER", task: { status: TaskStatus.AI_DRAFT } });
    fireEvent.click(screen.getByTestId("approve-btn"));
    expect(onApprove).toHaveBeenCalledWith(10);
  });

  it("calls onDelete when discard button clicked on AI_DRAFT", () => {
    const { onDelete } = renderDrawer({ role: "OWNER", task: { status: TaskStatus.AI_DRAFT } });
    fireEvent.click(screen.getByTestId("discard-btn"));
    expect(onDelete).toHaveBeenCalledWith(10);
  });

  it("shows Complete button for owner in REVIEW status", () => {
    renderDrawer({ role: "OWNER", task: { status: TaskStatus.REVIEW } });
    expect(screen.getByText("Complete")).toBeInTheDocument();
  });

  it("hides Complete button for assignee in REVIEW status", () => {
    renderDrawer({ role: "ASSIGNEE", task: { status: TaskStatus.REVIEW } });
    expect(screen.queryByText("Complete")).not.toBeInTheDocument();
  });

  it("shows Start Work button in TODO status", () => {
    renderDrawer({ task: { status: TaskStatus.TODO } });
    expect(screen.getByText("Start Work")).toBeInTheDocument();
  });

  it("shows delete button for owner on non-AI_DRAFT tasks", () => {
    renderDrawer({ role: "OWNER", task: { status: TaskStatus.TODO } });
    expect(screen.getByTestId("delete-btn")).toBeInTheDocument();
  });

  it("shows delete confirmation on delete button click", () => {
    renderDrawer({ role: "OWNER", task: { status: TaskStatus.TODO } });
    fireEvent.click(screen.getByTestId("delete-btn"));
    expect(screen.getByText("Delete this task?")).toBeInTheDocument();
    expect(screen.getByTestId("delete-confirm-btn")).toBeInTheDocument();
  });

  it("calls onDelete after confirming deletion", () => {
    const { onDelete } = renderDrawer({ role: "OWNER", task: { status: TaskStatus.TODO } });
    fireEvent.click(screen.getByTestId("delete-btn"));
    fireEvent.click(screen.getByTestId("delete-confirm-btn"));
    expect(onDelete).toHaveBeenCalledWith(10);
  });

  it("hides delete button for assignee", () => {
    renderDrawer({ role: "ASSIGNEE", task: { status: TaskStatus.TODO } });
    expect(screen.queryByTestId("delete-btn")).not.toBeInTheDocument();
  });

  it("shows assignee select for owner", () => {
    renderDrawer({ role: "OWNER" });
    const select = screen.getByTestId("assignee-select");
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue("2");
  });

  it("shows assignee name and avatar for assignee role", () => {
    renderDrawer({ role: "ASSIGNEE" });
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByTitle("Test User")).toBeInTheDocument();
  });

  it("calls onAssigneeChange when assignee is changed", () => {
    const { onAssigneeChange } = renderDrawer({ role: "OWNER" });
    const select = screen.getByTestId("assignee-select");
    fireEvent.change(select, { target: { value: "1" } });
    expect(onAssigneeChange).toHaveBeenCalledWith(10, 1);
  });

  it("shows comment input field", () => {
    renderDrawer();
    expect(screen.getByTestId("comment-input")).toBeInTheDocument();
  });

  it("shows activity section header", () => {
    renderDrawer();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });

  it("shows attachments section", () => {
    renderDrawer();
    expect(screen.getByText("Attachments")).toBeInTheDocument();
  });

  it("shows file upload input", () => {
    renderDrawer();
    expect(screen.getByTestId("attachment-file-input")).toBeInTheDocument();
  });

  it("shows history section with dates", () => {
    renderDrawer();
    expect(screen.getByText("History")).toBeInTheDocument();
  });
});
