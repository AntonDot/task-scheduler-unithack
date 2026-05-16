import { api } from "./client";

export interface NotificationItem {
  id: string;
  type: string;   // task_assigned | comment | status_change | mention
  title: string;
  body: string;
  task_id: number | null;
  task_title: string;
  created_at: string;
  actor_name: string;
}

export function fetchNotifications(): Promise<NotificationItem[]> {
  return api.get<NotificationItem[]>("/notifications");
}
