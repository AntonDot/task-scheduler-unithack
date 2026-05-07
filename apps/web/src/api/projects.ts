import type { Project } from "@/types/domain";
import { api } from "./client";

export function fetchProjects(): Promise<Project[]> {
  return api.get<Project[]>("/projects");
}
