export type DeadlineStatus = "overdue" | "due-soon" | "normal" | "none";

export function getDeadlineStatus(deadline: string | null): DeadlineStatus {
  if (!deadline) return "none";
  const now = Date.now();
  const deadlineTime = new Date(deadline).getTime();
  const diff = deadlineTime - now;

  if (diff < 0) return "overdue";
  if (diff < 24 * 60 * 60 * 1000) return "due-soon";
  return "normal";
}

export function formatRelativeDeadline(deadline: string | null): string | null {
  if (!deadline) return null;
  const now = Date.now();
  const deadlineTime = new Date(deadline).getTime();
  const diff = deadlineTime - now;
  const absDiff = Math.abs(diff);

  const hours = Math.floor(absDiff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (diff < 0) {
    if (days > 0) return `Overdue by ${days}d`;
    return `Overdue by ${Math.max(1, hours)}h`;
  }

  if (days > 0) return `${days}d left`;
  return `${Math.max(1, hours)}h left`;
}
