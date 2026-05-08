import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Avatar } from "@/components/kanban/Avatar";

describe("Avatar", () => {
  it("renders initials from full name", () => {
    render(<Avatar name="Анна Козлова" />);
    expect(screen.getByText("АК")).toBeInTheDocument();
  });

  it("renders initials from single word name", () => {
    render(<Avatar name="Admin" />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders initials from three-word name (max 2 chars)", () => {
    render(<Avatar name="John Michael Smith" />);
    expect(screen.getByText("JM")).toBeInTheDocument();
  });

  it("uses default size of 28", () => {
    render(<Avatar name="Test User" />);
    const el = screen.getByTitle("Test User");
    expect(el.style.width).toBe("28px");
    expect(el.style.height).toBe("28px");
  });

  it("uses custom size when provided", () => {
    render(<Avatar name="Test User" size={40} />);
    const el = screen.getByTitle("Test User");
    expect(el.style.width).toBe("40px");
    expect(el.style.height).toBe("40px");
  });

  it("sets the title attribute to the full name", () => {
    render(<Avatar name="Дмитрий Морозов" />);
    expect(screen.getByTitle("Дмитрий Морозов")).toBeInTheDocument();
  });

  it("has avatar class", () => {
    render(<Avatar name="Test User" />);
    const el = screen.getByTitle("Test User");
    expect(el.className).toContain("avatar");
  });

  it("renders with circular border radius", () => {
    render(<Avatar name="Test User" />);
    const el = screen.getByTitle("Test User");
    expect(el.style.borderRadius).toBe("50%");
  });

  it("scales font size to 0.4 of size", () => {
    render(<Avatar name="Test User" size={40} />);
    const el = screen.getByTitle("Test User");
    expect(el.style.fontSize).toBe("16px");
  });
});
