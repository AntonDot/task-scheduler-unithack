import type { Task } from "@/types/domain";
import { api } from "./client";

export function fetchTasks(projectId: number, assigneeId?: number): Promise<Task[]> {
  const params = assigneeId ? `?assignee_id=${assigneeId}` : "";
  return api.get<Task[]>(`/projects/${projectId}/tasks${params}`);
}

export function createTask(
  projectId: number,
  body: { title: string; description?: string; assignee_id?: number; urgency?: string; deadline?: string; column_id?: number; tag_ids?: number[] },
): Promise<Task> {
  return api.post<Task>(`/projects/${projectId}/tasks`, body);
}

export function updateTask(
  taskId: number,
  body: { title?: string; description?: string; assignee_id?: number | null; co_assignee_ids?: number[]; urgency?: string; deadline?: string | null; tag_ids?: number[] },
): Promise<Task> {
  return api.patch<Task>(`/tasks/${taskId}`, body);
}

export function changeColumn(taskId: number, column_id: number): Promise<Task> {
  return api.patch<Task>(`/tasks/${taskId}/column`, { column_id });
}

export function fetchTask(taskId: number): Promise<Task> {
  return api.get<Task>(`/tasks/${taskId}`);
}

export function deleteTask(taskId: number): Promise<void> {
  return api.delete<void>(`/tasks/${taskId}`);
}
