import { api } from './client';

export interface Automation {
  id: string;
  project_id: number;
  name: string;
  description: string;
  is_active: boolean;
  config: {
    trigger: { type: string; filters: Record<string, any> };
    conditions: Array<{ type: string; params: Record<string, any> }>;
    actions: Array<{ type: string; params: Record<string, any> }>;
  };
  stats_runs: number;
  webhook_token?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationLog {
  id: string;
  automation_id: string;
  status: 'success' | 'failure';
  details: Record<string, any>;
  ran_at: string;
}

export interface ReviewScrapeResult {
  reviews_found: number;
  negative_found: number;
  tasks_created: number;
  duplicates: number;
  errors: number;
  ran_at: string;
  details: Array<{
    review_id?: string;
    author?: string;
    rating?: number;
    task_id?: number;
    status: string;
    detail?: string;
  }>;
}

export interface AutomationTemplate {
  category: string;
  templates: Array<{
    name: string;
    description: string;
    config: any;
  }>;
}

export function listAutomations(projectId: number): Promise<Automation[]> {
  return api.get<Automation[]>(`/automations?project_id=${projectId}`);
}

export function createAutomation(data: Partial<Automation>): Promise<Automation> {
  return api.post<Automation>('/automations', data);
}

export function updateAutomation(id: string, data: Partial<Automation>): Promise<Automation> {
  return api.put<Automation>(`/automations/${id}`, data);
}

export function deleteAutomation(id: string): Promise<void> {
  return api.delete(`/automations/${id}`);
}

export function getAutomationHistory(id: string): Promise<AutomationLog[]> {
  return api.get<AutomationLog[]>(`/automations/${id}/history`);
}

export function getAutomationCatalog(): Promise<AutomationTemplate[]> {
  return api.get<AutomationTemplate[]>('/automations/catalog');
}

export function rotateWebhookToken(id: string): Promise<Automation> {
  return api.post<Automation>(`/automations/${id}/rotate-token`);
}

// Keep legacy for now if needed by other components, but redirect to new logic if possible
export function runReviewScraper(): Promise<ReviewScrapeResult> {
  return api.post<ReviewScrapeResult>('/automations/run-review-scraper');
}
