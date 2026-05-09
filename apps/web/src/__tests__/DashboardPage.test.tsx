import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardPage } from "@/pages/DashboardPage";
import * as analyticsApi from "@/api/analytics";
import type { ProjectAnalytics } from "@/api/analytics";

vi.mock("@/api/analytics", () => ({
  fetchAnalytics: vi.fn(),
}));

vi.mock("@/api/export", () => ({
  exportCSV: vi.fn(),
}));

const MOCK_ANALYTICS: ProjectAnalytics = {
  total_tasks: 25,
  by_status: {
    AI_DRAFT: 3,
    TODO: 8,
    IN_PROGRESS: 6,
    REVIEW: 4,
    DONE: 4,
  },
  by_urgency: {
    LOW: 5,
    MEDIUM: 10,
    HIGH: 7,
    URGENT: 3,
  },
  overdue_count: 5,
  avg_completion_hours: 48.5,
  assignee_load: [
    { user_id: 1, full_name: "Alice Smith", task_count: 10, in_progress: 3 },
    { user_id: 2, full_name: "Bob Jones", task_count: 8, in_progress: 2 },
  ],
};

function renderDashboard(projectId: number = 1) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage projectId={projectId} />
    </QueryClientProvider>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.mocked(analyticsApi.fetchAnalytics).mockResolvedValue(MOCK_ANALYTICS);
  });

  it("renders analytics data", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("25")).toBeInTheDocument();
    });
  });

  it("shows status breakdown", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("TODO")).toBeInTheDocument();
      // Check that "Status Breakdown" section exists and contains the bars
      expect(screen.getByText("Status Breakdown")).toBeInTheDocument();
    });
  });

  it("shows assignee load table", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });
  });

  it("shows overdue count", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/overdue/i)).toBeInTheDocument();
      // The overdue stat has a specific class
      const overdueCard = document.querySelector(".dashboard__card--overdue");
      expect(overdueCard).not.toBeNull();
    });
  });

  it("shows average completion time", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/48\.5/)).toBeInTheDocument();
    });
  });

  it("renders export CSV button", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("25")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
  });
});
