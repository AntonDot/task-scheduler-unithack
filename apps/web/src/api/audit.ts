import { api } from './client';

export interface AuditLog {
  id: number;
  task_id: number;
  user_id: number;
  action: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  user: { id: number; full_name: string; email: string } | null;
}

export function fetchAuditLogs(taskId: number): Promise<AuditLog[]> {
  return api.get<AuditLog[]>(`/tasks/${taskId}/audit`);
}
