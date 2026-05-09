import { api } from "./client";

export interface AssigneeLoad {
  user_id: number;
  full_name: string;
  task_count: number;
  in_progress: number;
}

export interface ProjectAnalytics {
  total_tasks: number;
  by_status: Record<string, number>;
  by_urgency: Record<string, number>;
  overdue_count: number;
  avg_completion_hours: number | null;
  assignee_load: AssigneeLoad[];
}

export function fetchAnalytics(projectId: number): Promise<ProjectAnalytics> {
  return api.get<ProjectAnalytics>(`/projects/${projectId}/analytics`);
}
