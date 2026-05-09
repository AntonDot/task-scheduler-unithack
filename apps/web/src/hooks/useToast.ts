import { useState, useCallback } from "react";

export interface ToastItem {
  id: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

let toastCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback(
    (message: string, type: "info" | "success" | "warning" | "error") => {
      const id = `toast-${++toastCounter}-${Date.now()}`;
      setToasts((prev) => [...prev, { id, message, type }]);
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}
