import { api } from "./client";

export interface CommentUser {
  id: number;
  full_name: string;
  email: string;
}

export interface Comment {
  id: number;
  task_id: number;
  user_id: number;
  text: string;
  created_at: string;
  user: CommentUser | null;
}

export function fetchComments(taskId: number): Promise<Comment[]> {
  return api.get<Comment[]>(`/tasks/${taskId}/comments`);
}

export function addComment(taskId: number, text: string): Promise<Comment> {
  return api.post<Comment>(`/tasks/${taskId}/comments`, { text });
}
