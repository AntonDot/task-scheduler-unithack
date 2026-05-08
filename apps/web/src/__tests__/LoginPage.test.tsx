import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LoginPage } from "@/pages/LoginPage";

describe("LoginPage", () => {
  it("renders the login title", () => {
    render(<LoginPage onLogin={vi.fn()} />);
    expect(screen.getByText("Victory Group")).toBeInTheDocument();
  });

  it("renders the subtitle", () => {
    render(<LoginPage onLogin={vi.fn()} />);
    expect(screen.getByText("Task Scheduler — Demo Login")).toBeInTheDocument();
  });

  it("renders all demo user buttons", () => {
    render(<LoginPage onLogin={vi.fn()} />);
    expect(screen.getByText("Дмитрий Морозов (Owner)")).toBeInTheDocument();
    expect(screen.getByText("Анна Козлова (Assignee)")).toBeInTheDocument();
    expect(screen.getByText("Игорь Петров (Assignee)")).toBeInTheDocument();
  });

  it("calls onLogin with the correct email when a user button is clicked", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} />);
    fireEvent.click(screen.getByText("Дмитрий Морозов (Owner)"));
    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith("d.morozov@victorygroup.ru");
    });
  });

  it("shows error message when login fails", async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error("fail"));
    render(<LoginPage onLogin={onLogin} />);
    fireEvent.click(screen.getByText("Анна Козлова (Assignee)"));
    await waitFor(() => {
      expect(screen.getByText("Login failed. Is the backend running?")).toBeInTheDocument();
    });
  });

  it("disables buttons while loading", async () => {
    let resolve: () => void;
    const onLogin = vi.fn().mockImplementation(
      () => new Promise<void>((r) => { resolve = r; }),
    );
    render(<LoginPage onLogin={onLogin} />);
    fireEvent.click(screen.getByText("Дмитрий Морозов (Owner)"));

    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });

    resolve!();
    await waitFor(() => {
      const btns = screen.getAllByRole("button");
      btns.forEach((btn) => {
        expect(btn).not.toBeDisabled();
      });
    });
  });
});
