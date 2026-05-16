import { api } from "./client";

export interface ProjectMember {
  id: number;
  full_name: string;
  email: string;
  role: string;
  avatar_data?: string | null;
}

export function fetchProjectMembers(projectId: number): Promise<ProjectMember[]> {
  return api.get<ProjectMember[]>(`/projects/${projectId}/members`);
}
