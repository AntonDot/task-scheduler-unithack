import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LoginPage } from "@/pages/LoginPage";

// Mock getLoginMode to return dev mode by default
vi.mock("@/api/auth", () => ({
  getLoginMode: vi.fn().mockResolvedValue({ dev_login: true }),
}));

describe("LoginPage — dev mode", () => {
  it("renders the login title", async () => {
    render(<LoginPage onLogin={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Victory Group")).toBeInTheDocument();
    });
  });

  it("renders the subtitle", async () => {
    render(<LoginPage onLogin={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Task Scheduler")).toBeInTheDocument();
    });
  });

  it("renders all demo user names in dev mode", async () => {
    render(<LoginPage onLogin={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Дмитрий Морозов")).toBeInTheDocument();
    });
    expect(screen.getByText("Анна Козлова")).toBeInTheDocument();
    expect(screen.getByText("Игорь Петров")).toBeInTheDocument();
  });

  it("calls onLogin with the correct email when a user button is clicked", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} />);
    await waitFor(() => {
      expect(screen.getByText("Дмитрий Морозов")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Дмитрий Морозов").closest("button")!);
    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith("d.morozov@victorygroup.ru");
    });
  });

  it("shows error message when login fails", async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error("fail"));
    render(<LoginPage onLogin={onLogin} />);
    await waitFor(() => {
      expect(screen.getByText("Анна Козлова")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Анна Козлова").closest("button")!);
    await waitFor(() => {
      expect(screen.getByText(/Вход не удался/)).toBeInTheDocument();
    });
  });

  it("disables buttons while loading", async () => {
    let resolve: () => void;
    const onLogin = vi.fn().mockImplementation(
      () => new Promise<void>((r) => { resolve = r; }),
    );
    render(<LoginPage onLogin={onLogin} />);
    await waitFor(() => {
      expect(screen.getByText("Дмитрий Морозов")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Дмитрий Морозов").closest("button")!);

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
