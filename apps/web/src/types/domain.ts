export interface BoardColumn {
  id: number;
  project_id: number;
  name: string;
  color: string;
  order: number;
}

export const ProjectRole = {
  OWNER: "OWNER",
  ASSIGNEE: "ASSIGNEE",
} as const;

export type ProjectRole = (typeof ProjectRole)[keyof typeof ProjectRole];

export const Urgency = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;

export type Urgency = (typeof Urgency)[keyof typeof Urgency];

export interface User {
  id: number;
  full_name: string;
  email: string;
  is_active: boolean;
  accent_color?: string;
  is_dark?: boolean;
  avatar_data?: string | null;
}

export interface Project {
  id: number;
  name: string;
  slug: string;
  color: string;
}

export interface Tag {
  id: number;
  project_id: number;
  name: string;
  color: string;
}

export interface Task {
  id: number;
  project_id: number;
  creator_id: number;
  assignee_id: number | null;
  title: string;
  description: string | null;
  column_id: number;
  urgency: Urgency;
  deadline: string | null;
  created_at: string;
  updated_at: string;
  project?: Project;
  assignee?: User;
  co_assignees?: User[];
  tags?: Tag[];
}
