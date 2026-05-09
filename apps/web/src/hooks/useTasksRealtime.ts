import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

type AddToastFn = (message: string, type: "info" | "success" | "warning" | "error") => void;

interface WsEvent {
  event: string;
  data?: { title?: string };
}

export function useTasksRealtime(
  projectId: number | null,
  addToast?: AddToastFn,
) {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws/${projectId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });

      if (addToast && typeof event.data === "string") {
        try {
          const parsed: WsEvent = JSON.parse(event.data);
          const title = parsed.data?.title ?? "";

          switch (parsed.event) {
            case "task_created":
              addToast(`New task: ${title}`, "info");
              break;
            case "task_status_changed":
              addToast(`Task status changed: ${title}`, "info");
              break;
            case "task_approved":
              addToast(`Draft approved: ${title}`, "success");
              break;
            case "task_deleted":
              addToast("Task deleted", "warning");
              break;
            case "comment_added":
              addToast("New comment on task", "info");
              break;
          }
        } catch {
          // Not valid JSON, ignore
        }
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [projectId, queryClient, addToast]);
}
