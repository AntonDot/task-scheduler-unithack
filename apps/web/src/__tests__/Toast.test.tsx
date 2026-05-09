import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { renderHook } from "@testing-library/react";

describe("Toast component", () => {
  it("renders toast message", () => {
    render(
      <Toast
        id="t1"
        message="Task created"
        type="info"
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText("Task created")).toBeInTheDocument();
  });

  it("applies correct type class for info", () => {
    const { container } = render(
      <Toast id="t1" message="Info toast" type="info" onRemove={vi.fn()} />,
    );
    const el = container.querySelector(".toast");
    expect(el?.className).toContain("toast--info");
  });

  it("applies correct type class for success", () => {
    const { container } = render(
      <Toast id="t1" message="Done" type="success" onRemove={vi.fn()} />,
    );
    const el = container.querySelector(".toast");
    expect(el?.className).toContain("toast--success");
  });

  it("applies correct type class for warning", () => {
    const { container } = render(
      <Toast id="t1" message="Warning" type="warning" onRemove={vi.fn()} />,
    );
    const el = container.querySelector(".toast");
    expect(el?.className).toContain("toast--warning");
  });

  it("applies correct type class for error", () => {
    const { container } = render(
      <Toast id="t1" message="Error" type="error" onRemove={vi.fn()} />,
    );
    const el = container.querySelector(".toast");
    expect(el?.className).toContain("toast--error");
  });

  it("calls onRemove after timeout", () => {
    vi.useFakeTimers();
    const onRemove = vi.fn();
    render(
      <Toast id="t1" message="Auto-dismiss" type="info" onRemove={onRemove} />,
    );
    expect(onRemove).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onRemove).toHaveBeenCalledWith("t1");
    vi.useRealTimers();
  });

  it("close button removes toast", () => {
    const onRemove = vi.fn();
    render(
      <Toast id="t1" message="Closeable" type="info" onRemove={onRemove} />,
    );
    const closeBtn = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onRemove).toHaveBeenCalledWith("t1");
  });
});

describe("useToast hook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with empty toasts array", () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toasts).toEqual([]);
  });

  it("addToast adds a toast to the list", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.addToast("Hello", "info");
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.message).toBe("Hello");
    expect(result.current.toasts[0]?.type).toBe("info");
  });

  it("removeToast removes a toast by id", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.addToast("First", "info");
    });
    const id = result.current.toasts[0]?.id;
    expect(id).toBeDefined();
    act(() => {
      result.current.removeToast(id!);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("supports multiple toasts", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.addToast("First", "info");
      result.current.addToast("Second", "success");
    });
    expect(result.current.toasts).toHaveLength(2);
  });
});
