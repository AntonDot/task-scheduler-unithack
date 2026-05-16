import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileTaskCard } from "@/components/mobile/MobileTaskCard";
import type { Task } from "@/types/domain";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 10,
    project_id: 1,
    creator_id: 1,
    assignee_id: 2,
    title: "Mobile task title",
    description: null,
    column_id: 1,
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
    onDelete: ReturnType<typeof vi.fn>;
    onLongPress: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const props = {
    task,
    role: overrides.role ?? ("OWNER" as const),
    onApprove: overrides.onApprove ?? vi.fn(),
    onDelete: overrides.onDelete ?? vi.fn(),
    onLongPress: overrides.onLongPress ?? vi.fn(),
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

  it("shows discard button for owner", () => {
    const onDelete = vi.fn();
    renderCard(makeTask(), { role: "OWNER", onDelete });
    const btn = screen.getByTestId("mobile-discard-10");
    expect(btn).toBeInTheDocument();
  });

  it("calls onDelete when discard button clicked", () => {
    const onDelete = vi.fn();
    renderCard(makeTask(), { role: "OWNER", onDelete });
    fireEvent.click(screen.getByTestId("mobile-discard-10"));
    expect(onDelete).toHaveBeenCalledWith(10);
  });

  it("shows approve button for owner", () => {
    const onApprove = vi.fn();
    renderCard(makeTask(), { role: "OWNER", onApprove });
    const btn = screen.getByTestId("mobile-approve-10");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onApprove).toHaveBeenCalledWith(10);
  });

  it("hides action buttons for assignee", () => {
    renderCard(makeTask(), { role: "ASSIGNEE" });
    expect(screen.queryByTestId("mobile-approve-10")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-discard-10")).not.toBeInTheDocument();
  });

  it("shows project tag when project is present", () => {
    renderCard(makeTask());
    expect(screen.getByText("Онегин Парк")).toBeInTheDocument();
  });

  it("shows assignee avatar when assignee is present", () => {
    renderCard(makeTask());
    expect(screen.getByTitle("Анна Козлова")).toBeInTheDocument();
  });

  it("triggers onLongPress via context menu", () => {
    const onLongPress = vi.fn();
    renderCard(makeTask(), { onLongPress });
    const card = screen.getByTestId("mobile-card-10");
    fireEvent.contextMenu(card);
    expect(onLongPress).toHaveBeenCalled();
  });
});
