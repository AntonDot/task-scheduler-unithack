import { useEffect } from "react";
import type { ToastItem } from "@/hooks/useToast";

interface ToastProps {
  id: string;
  message: string;
  type: ToastItem["type"];
  onRemove: (id: string) => void;
}

export function Toast({ id, message, type, onRemove }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [id, onRemove]);

  return (
    <div className={`toast toast--${type}`}>
      <span className="toast__text">{message}</span>
      <button
        className="toast__close"
        onClick={() => onRemove(id)}
        aria-label="close"
      >
        &times;
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          id={t.id}
          message={t.message}
          type={t.type}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
