import { api } from './client';

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

export function runReviewScraper(): Promise<ReviewScrapeResult> {
  return api.post<ReviewScrapeResult>('/automations/run-review-scraper');
}
