import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useTasksRealtime(projectId: number | null) {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws/${projectId}`);
    wsRef.current = ws;

    ws.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [projectId, queryClient]);
}
