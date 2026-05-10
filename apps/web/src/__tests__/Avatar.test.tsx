import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Avatar } from "@/components/kanban/Avatar";

describe("Avatar", () => {
  it("renders initials from full name", () => {
    render(<Avatar user={{ full_name: "Анна Козлова", id: 1 }} />);
    expect(screen.getByText("АК")).toBeInTheDocument();
  });

  it("renders initials from single word name", () => {
    render(<Avatar user={{ full_name: "Admin", id: 2 }} />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders initials from three-word name (max 2 chars)", () => {
    render(<Avatar user={{ full_name: "John Michael Smith", id: 3 }} />);
    expect(screen.getByText("JM")).toBeInTheDocument();
  });

  it("uses default size of 28", () => {
    render(<Avatar user={{ full_name: "Test User", id: 4 }} />);
    const el = screen.getByTitle("Test User");
    expect(el.style.width).toBe("28px");
    expect(el.style.height).toBe("28px");
  });

  it("uses custom size when provided", () => {
    render(<Avatar user={{ full_name: "Test User", id: 5 }} size={40} />);
    const el = screen.getByTitle("Test User");
    expect(el.style.width).toBe("40px");
    expect(el.style.height).toBe("40px");
  });

  it("sets the title attribute to the full name", () => {
    render(<Avatar user={{ full_name: "Дмитрий Морозов", id: 6 }} />);
    expect(screen.getByTitle("Дмитрий Морозов")).toBeInTheDocument();
  });

  it("renders with circular border radius", () => {
    render(<Avatar user={{ full_name: "Test User", id: 7 }} />);
    const wrapper = screen.getByTitle("Test User");
    const inner = wrapper.firstElementChild as HTMLElement;
    expect(inner.style.borderRadius).toBe("50%");
  });

  it("returns null when user is not provided", () => {
    const { container } = render(<Avatar user={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows online dot when showOnline and online are true", () => {
    const { container } = render(
      <Avatar user={{ full_name: "Test User", id: 8 }} showOnline online />
    );
    // Should have 2 children: the circle and the dot
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.children.length).toBe(2);
  });
});
