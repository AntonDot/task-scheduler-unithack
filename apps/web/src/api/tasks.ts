import type { Task, TaskStatus } from "@/types/domain";
import { api } from "./client";

export function fetchTasks(projectId: number, assigneeId?: number): Promise<Task[]> {
  const params = assigneeId ? `?assignee_id=${assigneeId}` : "";
  return api.get<Task[]>(`/projects/${projectId}/tasks${params}`);
}

export function createTask(
  projectId: number,
  body: { title: string; description?: string; assignee_id?: number; urgency?: string },
): Promise<Task> {
  return api.post<Task>(`/projects/${projectId}/tasks`, body);
}

export function updateTask(
  taskId: number,
  body: { title?: string; description?: string; assignee_id?: number; urgency?: string },
): Promise<Task> {
  return api.patch<Task>(`/tasks/${taskId}`, body);
}

export function changeStatus(taskId: number, status: TaskStatus): Promise<Task> {
  return api.patch<Task>(`/tasks/${taskId}/status`, { status });
}

export function approveDraft(taskId: number): Promise<Task> {
  return api.post<Task>(`/tasks/${taskId}/approve`);
}

export function fetchTask(taskId: number): Promise<Task> {
  return api.get<Task>(`/tasks/${taskId}`);
}

export function discardDraft(taskId: number): Promise<void> {
  return api.delete<void>(`/tasks/${taskId}`);
}
