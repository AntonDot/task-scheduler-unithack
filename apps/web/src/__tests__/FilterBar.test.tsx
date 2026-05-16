import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FilterBar } from "@/components/kanban/FilterBar";

function renderFilterBar(overrides: Partial<Parameters<typeof FilterBar>[0]> = {}) {
  const defaultProps = {
    search: "",
    onSearchChange: vi.fn(),
    urgencyFilter: "ALL" as const,
    onUrgencyChange: vi.fn(),
    statusFilter: "ALL" as const,
    onStatusChange: vi.fn(),
  };
  return {
    ...render(<FilterBar {...defaultProps} {...overrides} />),
    props: { ...defaultProps, ...overrides },
  };
}

describe("FilterBar", () => {
  it("renders search input", () => {
    renderFilterBar();
    const input = screen.getByPlaceholderText(/поиск/i);
    expect(input).toBeInTheDocument();
  });

  it("renders urgency dropdown", () => {
    renderFilterBar();
    const selects = screen.getAllByRole("combobox");
    // At least one dropdown for urgency
    const urgencySelect = selects.find(
      (s) => s.getAttribute("data-testid") === "urgency-filter",
    );
    expect(urgencySelect).toBeDefined();
  });

  it("renders status dropdown", () => {
    renderFilterBar();
    const selects = screen.getAllByRole("combobox");
    const statusSelect = selects.find(
      (s) => s.getAttribute("data-testid") === "status-filter",
    );
    expect(statusSelect).toBeDefined();
  });

  it("calls onSearchChange when typing", () => {
    const onSearchChange = vi.fn();
    renderFilterBar({ onSearchChange });
    const input = screen.getByPlaceholderText(/поиск/i);
    fireEvent.change(input, { target: { value: "fix bug" } });
    expect(onSearchChange).toHaveBeenCalledWith("fix bug");
  });

  it("calls onUrgencyChange when selecting", () => {
    const onUrgencyChange = vi.fn();
    renderFilterBar({ onUrgencyChange });
    const urgencySelect = screen.getByTestId("urgency-filter");
    fireEvent.change(urgencySelect, { target: { value: "HIGH" } });
    expect(onUrgencyChange).toHaveBeenCalledWith("HIGH");
  });

  it("calls onStatusChange when selecting", () => {
    const onStatusChange = vi.fn();
    renderFilterBar({ onStatusChange });
    const statusSelect = screen.getByTestId("status-filter");
    fireEvent.change(statusSelect, { target: { value: "backlog" } });
    expect(onStatusChange).toHaveBeenCalledWith("backlog");
  });

  it("displays current search value", () => {
    renderFilterBar({ search: "deploy" });
    const input = screen.getByPlaceholderText(/поиск/i) as HTMLInputElement;
    expect(input.value).toBe("deploy");
  });

  it("displays current urgency filter value", () => {
    renderFilterBar({ urgencyFilter: "HIGH" });
    const urgencySelect = screen.getByTestId("urgency-filter") as HTMLSelectElement;
    expect(urgencySelect.value).toBe("HIGH");
  });
});
