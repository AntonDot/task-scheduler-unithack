import type { BoardColumn } from "@/types/domain";
import { api } from "./client";

export function fetchColumns(projectId: number): Promise<BoardColumn[]> {
  return api.get<BoardColumn[]>(`/projects/${projectId}/columns`);
}

export function createColumn(
  projectId: number,
  body: { name: string; color?: string; order?: number },
): Promise<BoardColumn> {
  return api.post<BoardColumn>(`/projects/${projectId}/columns`, body);
}

export function updateColumn(
  projectId: number,
  columnId: number,
  body: { name?: string; color?: string },
): Promise<BoardColumn> {
  return api.put<BoardColumn>(`/projects/${projectId}/columns/${columnId}`, body);
}

export function deleteColumn(projectId: number, columnId: number): Promise<void> {
  return api.delete<void>(`/projects/${projectId}/columns/${columnId}`);
}

export function reorderColumns(projectId: number, columnIds: number[]): Promise<void> {
  return api.put<void>(`/projects/${projectId}/columns/reorder`, { column_ids: columnIds });
}
