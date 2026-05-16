import type { Tag } from "@/types/domain";
import { api } from "./client";

export function fetchProjectTags(projectId: number): Promise<Tag[]> {
  return api.get<Tag[]>(`/projects/${projectId}/tags`);
}

export function createTag(
  projectId: number,
  body: { name: string; color: string }
): Promise<Tag> {
  return api.post<Tag>(`/projects/${projectId}/tags`, body);
}

export function deleteTag(tagId: number): Promise<void> {
  return api.delete<void>(`/tags/${tagId}`);
}
