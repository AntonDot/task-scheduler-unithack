import type { Tag } from "@/types/domain";
import { api } from "./client";

export type ProjectTag = Tag;

export function fetchProjectTags(projectId: number): Promise<ProjectTag[]> {
  return api.get<ProjectTag[]>(`/projects/${projectId}/tags`);
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
