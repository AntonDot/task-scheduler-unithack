import { api } from "./client";

export interface ImproveResponse {
  title: string;
  description: string;
  urgency: string;
}

export function improveText(text: string, projectSlug?: string): Promise<ImproveResponse> {
  return api.post<ImproveResponse>("/ai/improve", { text, project_slug: projectSlug ?? null });
}
