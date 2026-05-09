import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Header } from "@/components/layout/Header";
import type { User, Project } from "@/types/domain";

const MOCK_USER: User = {
  id: 1,
  full_name: "Дмитрий Морозов",
  email: "d.morozov@victorygroup.ru",
  is_active: true,
};

const MOCK_PROJECTS: Project[] = [
  { id: 1, name: "Онегин Парк", slug: "onegin-park", color: "#6c63ff" },
  { id: 2, name: "Проект Альфа", slug: "project-alpha", color: "#e74c3c" },
];

function renderHeader(overrides: Partial<Parameters<typeof Header>[0]> = {}) {
  const defaultProps = {
    user: MOCK_USER,
    projects: MOCK_PROJECTS,
    selectedProjectId: 1,
    onSelectProject: vi.fn(),
    showOnlyMine: false,
    onToggleMine: vi.fn(),
    onLogout: vi.fn(),
  };
  return { ...render(<Header {...defaultProps} {...overrides} />), props: { ...defaultProps, ...overrides } };
}

describe("Header", () => {
  it("renders user name", () => {
    renderHeader();
    expect(screen.getByText("Дмитрий Морозов")).toBeInTheDocument();
  });

  it("renders user avatar with initials", () => {
    renderHeader();
    expect(screen.getByTitle("Дмитрий Морозов")).toBeInTheDocument();
  });

  it("renders project tabs", () => {
    renderHeader();
    expect(screen.getByText("Онегин Парк")).toBeInTheDocument();
    expect(screen.getByText("Проект Альфа")).toBeInTheDocument();
  });

  it("calls onSelectProject when tab is clicked", () => {
    const onSelectProject = vi.fn();
    renderHeader({ onSelectProject });
    fireEvent.click(screen.getByText("Проект Альфа"));
    expect(onSelectProject).toHaveBeenCalledWith(2);
  });

  it("shows active state on selected project", () => {
    renderHeader({ selectedProjectId: 1 });
    const btn = screen.getByText("Онегин Парк");
    expect(btn.className).toContain("active");

    const btn2 = screen.getByText("Проект Альфа");
    expect(btn2.className).not.toContain("active");
  });

  it("calls onToggleMine when filter checkbox is toggled", () => {
    const onToggleMine = vi.fn();
    renderHeader({ onToggleMine });
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(onToggleMine).toHaveBeenCalledOnce();
  });

  it("reflects showOnlyMine state on checkbox", () => {
    renderHeader({ showOnlyMine: true });
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("calls onLogout when logout button is clicked", () => {
    const onLogout = vi.fn();
    renderHeader({ onLogout });
    fireEvent.click(screen.getByText("Выйти"));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("renders the logo text", () => {
    renderHeader();
    expect(screen.getByText("Victory Group")).toBeInTheDocument();
  });
});
