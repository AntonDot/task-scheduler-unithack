import { useQuery } from "@tanstack/react-query";
import { fetchAnalytics } from "@/api/analytics";
import { exportCSV } from "@/api/export";

interface DashboardPageProps {
  projectId: number;
}

const STATUS_COLORS: Record<string, string> = {
  AI_DRAFT: "var(--text-secondary)",
  TODO: "var(--accent)",
  IN_PROGRESS: "var(--warning)",
  REVIEW: "#9b59b6",
  DONE: "var(--success)",
};

const URGENCY_COLORS: Record<string, string> = {
  LOW: "var(--success)",
  MEDIUM: "var(--accent)",
  HIGH: "var(--warning)",
  URGENT: "var(--urgent)",
};

export function DashboardPage({ projectId }: DashboardPageProps) {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ["analytics", projectId],
    queryFn: () => fetchAnalytics(projectId),
    enabled: !!projectId,
  });

  const handleExport = async () => {
    try {
      const blob = await exportCSV(projectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project-${projectId}-tasks.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Export failed silently
    }
  };

  if (isLoading) {
    return (
      <div className="dashboard">
        <p className="text-muted">Loading analytics...</p>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="dashboard">
        <p className="text-muted">No analytics data available.</p>
      </div>
    );
  }

  const maxStatusCount = Math.max(
    ...Object.values(analytics.by_status).map(Number),
    1,
  );
  const maxUrgencyCount = Math.max(
    ...Object.values(analytics.by_urgency).map(Number),
    1,
  );

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h2>Project Analytics</h2>
        <button
          className="btn btn--secondary"
          onClick={handleExport}
        >
          Export CSV
        </button>
      </div>

      <div className="dashboard__grid">
        <div className="dashboard__card">
          <div className="dashboard__stat">
            <span className="dashboard__stat-value">{analytics.total_tasks}</span>
            <span className="dashboard__stat-label">Total Tasks</span>
          </div>
        </div>

        <div className="dashboard__card dashboard__card--overdue">
          <div className="dashboard__stat">
            <span className="dashboard__stat-value dashboard__stat-value--overdue">
              {analytics.overdue_count}
            </span>
            <span className="dashboard__stat-label">Overdue</span>
          </div>
        </div>

        <div className="dashboard__card">
          <div className="dashboard__stat">
            <span className="dashboard__stat-value">
              {analytics.avg_completion_hours != null
                ? `${analytics.avg_completion_hours}h`
                : "N/A"}
            </span>
            <span className="dashboard__stat-label">Avg Completion</span>
          </div>
        </div>
      </div>

      <div className="dashboard__sections">
        <div className="dashboard__card">
          <h3>Status Breakdown</h3>
          <div className="dashboard__bars">
            {Object.entries(analytics.by_status).map(([status, count]) => (
              <div className="dashboard__bar-row" key={status}>
                <span className="dashboard__bar-label">{status}</span>
                <div className="dashboard__bar-track">
                  <div
                    className="dashboard__bar"
                    style={{
                      width: `${(Number(count) / maxStatusCount) * 100}%`,
                      background: STATUS_COLORS[status] ?? "var(--accent)",
                    }}
                  />
                </div>
                <span className="dashboard__bar-count">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard__card">
          <h3>Urgency Breakdown</h3>
          <div className="dashboard__bars">
            {Object.entries(analytics.by_urgency).map(([urgency, count]) => (
              <div className="dashboard__bar-row" key={urgency}>
                <span className="dashboard__bar-label">{urgency}</span>
                <div className="dashboard__bar-track">
                  <div
                    className="dashboard__bar"
                    style={{
                      width: `${(Number(count) / maxUrgencyCount) * 100}%`,
                      background: URGENCY_COLORS[urgency] ?? "var(--accent)",
                    }}
                  />
                </div>
                <span className="dashboard__bar-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard__card">
        <h3>Assignee Workload</h3>
        <table className="dashboard__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Tasks</th>
              <th>In Progress</th>
            </tr>
          </thead>
          <tbody>
            {analytics.assignee_load.map((a) => (
              <tr key={a.user_id}>
                <td>{a.full_name}</td>
                <td>{a.task_count}</td>
                <td>{a.in_progress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
