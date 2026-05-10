import { useQuery } from "@tanstack/react-query";
import { fetchAnalytics } from "@/api/analytics";
import { exportCSV } from "@/api/export";

interface DashboardPageProps {
  projectId: number;
}

const STATUS_COLORS: Record<string, string> = {
  AI_DRAFT: "#8B5CF6",
  TODO: "#6366F1",
  IN_PROGRESS: "#F59E0B",
  REVIEW: "#3B82F6",
  DONE: "#22C55E",
};

const DASHBOARD_URGENCY_COLORS: Record<string, string> = {
  LOW: "#22C55E",
  MEDIUM: "#6366F1",
  HIGH: "#F59E0B",
  URGENT: "#EF4444",
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
        <p className="text-muted">Загрузка аналитики...</p>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="dashboard">
        <p className="text-muted">Нет данных аналитики.</p>
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
        <h2>Аналитика проекта</h2>
        <button
          className="btn btn--secondary"
          onClick={handleExport}
        >
          Экспорт CSV
        </button>
      </div>

      <div className="dashboard__grid">
        <div className="dashboard__card">
          <div className="dashboard__stat">
            <span className="dashboard__stat-value">{analytics.total_tasks}</span>
            <span className="dashboard__stat-label">Всего задач</span>
          </div>
        </div>

        <div className="dashboard__card dashboard__card--overdue">
          <div className="dashboard__stat">
            <span className="dashboard__stat-value dashboard__stat-value--overdue">
              {analytics.overdue_count}
            </span>
            <span className="dashboard__stat-label">Просрочено</span>
          </div>
        </div>

        <div className="dashboard__card">
          <div className="dashboard__stat">
            <span className="dashboard__stat-value">
              {analytics.avg_completion_hours != null
                ? `${analytics.avg_completion_hours}ч`
                : "Н/Д"}
            </span>
            <span className="dashboard__stat-label">В среднем (часы)</span>
          </div>
        </div>
      </div>

      <div className="dashboard__sections">
        <div className="dashboard__card">
          <h3>Разбивка по статусу</h3>
          <div className="dashboard__bars">
            {Object.entries(analytics.by_status).map(([status, count]) => (
              <div className="dashboard__bar-row" key={status}>
                <span className="dashboard__bar-label">{status}</span>
                <div className="dashboard__bar-track">
                  <div
                    className="dashboard__bar"
                    style={{
                      width: `${(Number(count) / maxStatusCount) * 100}%`,
                      background: STATUS_COLORS[status] ?? "#6366F1",
                    }}
                  />
                </div>
                <span className="dashboard__bar-count">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard__card">
          <h3>Разбивка по срочности</h3>
          <div className="dashboard__bars">
            {Object.entries(analytics.by_urgency).map(([urgency, count]) => (
              <div className="dashboard__bar-row" key={urgency}>
                <span className="dashboard__bar-label">{urgency}</span>
                <div className="dashboard__bar-track">
                  <div
                    className="dashboard__bar"
                    style={{
                      width: `${(Number(count) / maxUrgencyCount) * 100}%`,
                      background: DASHBOARD_URGENCY_COLORS[urgency] ?? "#6366F1",
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
        <h3>Нагрузка исполнителей</h3>
        <table className="dashboard__table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Задачи</th>
              <th>В работе</th>
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
