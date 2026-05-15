import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TaskDrawer } from "@/components/kanban/TaskDrawer";
import { ThemeProvider } from "@/theme/ThemeContext";
import { createTheme } from "@/theme/theme";
import type { Task, BoardColumn } from "@/types/domain";

// Mock BlockEditor to avoid initialization issues in tests
vi.mock("@/components/editor/BlockEditor", () => ({
  BlockEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div data-testid="block-editor">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

// Mock fetch for comments and attachments
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: () => Promise.resolve([]),
}));

const lightTheme = createTheme(false);

const MOCK_COLUMNS: BoardColumn[] = [
  { id: 1, project_id: 1, name: "Backlog",     color: "#9CA3AF", order: 0 },
  { id: 2, project_id: 1, name: "In Progress", color: "#6366F1", order: 1 },
  { id: 3, project_id: 1, name: "In Review",   color: "#D97706", order: 2 },
  { id: 4, project_id: 1, name: "Done",        color: "#059669", order: 3 },
];

const BASE_TASK: Task = {
  id: 10, project_id: 1, creator_id: 1, assignee_id: 2,
  title: "Test task", description: "Some description",
  column_id: 1, urgency: "HIGH",
  deadline: "2025-06-01T00:00:00", created_at: "2025-05-01T00:00:00", updated_at: "2025-05-01T00:00:00",
  assignee: { id: 2, full_name: "Test User", email: "test@test.com", is_active: true },
};

const MOCK_MEMBERS = [
  { id: 1, full_name: "Дмитрий Морозов", email: "d.morozov@victory.ru", role: "OWNER" },
  { id: 2, full_name: "Test User", email: "test@test.com", role: "ASSIGNEE" },
];

function renderDrawer(taskOverrides: Partial<Task> = {}) {
  const task = { ...BASE_TASK, ...taskOverrides } as Task;
  const props = {
    task,
    columns: MOCK_COLUMNS,
    open: true,
    onClose: vi.fn(),
    onUpdate: vi.fn(),
    members: MOCK_MEMBERS,
    accentColor: "#6366F1",
    theme: lightTheme,
  };
  const result = render(
    <ThemeProvider>
      <TaskDrawer {...props} />
    </ThemeProvider>,
  );
  return { ...result, ...props };
}

describe("TaskDrawer", () => {
  it("shows task title", () => {
    renderDrawer();
    expect(screen.getByText("Test task")).toBeInTheDocument();
  });

  it("renders when task is provided and open is true", () => {
    renderDrawer();
    expect(screen.getByText("Test task")).toBeInTheDocument();
  });

  it("shows description editor", () => {
    renderDrawer();
    expect(screen.getByTestId("block-editor")).toBeInTheDocument();
  });

  it("shows column names in status selector", () => {
    renderDrawer();
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("In Review")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("shows urgency buttons", () => {
    renderDrawer();
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeInTheDocument();
  });

  it("shows assignee member avatars", () => {
    renderDrawer();
    expect(screen.getAllByTitle("Дмитрий Морозов")[0]).toBeInTheDocument();
    expect(screen.getAllByTitle("Test User")[0]).toBeInTheDocument();
  });

  it("shows close button", () => {
    const { onClose } = renderDrawer();
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not render when task is null", () => {
    const { container } = render(
      <ThemeProvider>
        <TaskDrawer
          task={null}
          columns={MOCK_COLUMNS}
          open={true}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          members={MOCK_MEMBERS}
          accentColor="#6366F1"
          theme={lightTheme}
        />
      </ThemeProvider>,
    );
    expect(container.firstChild).toBeNull();
  });
});
