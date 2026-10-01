import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTasksRealtime } from "@/hooks/useTasksRealtime";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

function socket(i: number): FakeWebSocket {
  const ws = FakeWebSocket.instances[i];
  if (!ws) throw new Error(`no WebSocket #${i}`);
  return ws;
}

function setup() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useTasksRealtime(7), { wrapper });
  return { hook, invalidate };
}

describe("useTasksRealtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reconnects with backoff when the replica closes the socket", () => {
    const { invalidate } = setup();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(socket(0).url).toMatch(/\/ws\/7$/);

    act(() => socket(0).onclose?.());
    act(() => vi.advanceTimersByTime(999));
    expect(FakeWebSocket.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeWebSocket.instances).toHaveLength(2);

    // events missed while disconnected are not replayed — the board is refetched
    invalidate.mockClear();
    act(() => socket(1).onopen?.());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["tasks", 7] });
  });

  it("does not reconnect after unmount", () => {
    const { hook } = setup();
    const ws = socket(0);
    hook.unmount();
    expect(ws.closed).toBe(true);

    act(() => ws.onclose?.());
    act(() => vi.advanceTimersByTime(60_000));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
