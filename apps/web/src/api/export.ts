const BASE = "/api/v1";

export async function exportCSV(projectId: number): Promise<Blob> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${BASE}/projects/${projectId}/export/csv`, {
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Export failed ${res.status}: ${text}`);
  }

  return res.blob();
}
