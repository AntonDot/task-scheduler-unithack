export const TaskStatus = {
  AI_DRAFT: "AI_DRAFT",
  TODO: "TODO",
  IN_PROGRESS: "IN_PROGRESS",
  REVIEW: "REVIEW",
  DONE: "DONE",
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const KANBAN_COLUMNS: TaskStatus[] = [
  TaskStatus.AI_DRAFT,
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.REVIEW,
  TaskStatus.DONE,
];

export const COLUMN_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.AI_DRAFT]: "AI Drafts",
  [TaskStatus.TODO]: "To Do",
  [TaskStatus.IN_PROGRESS]: "In Progress",
  [TaskStatus.REVIEW]: "Review",
  [TaskStatus.DONE]: "Done",
};

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
}

export interface Project {
  id: number;
  name: string;
  slug: string;
  color: string;
}

export interface Task {
  id: number;
  project_id: number;
  creator_id: number;
  assignee_id: number | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  urgency: Urgency;
  deadline: string | null;
  created_at: string;
  updated_at: string;
  project?: Project;
  assignee?: User;
}
