const BASE = "/api/v1";

export interface AttachmentUser {
  id: number;
  full_name: string;
  email: string;
}

export interface Attachment {
  id: number;
  task_id: number;
  user_id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  user: AttachmentUser | null;
}

export async function fetchAttachments(taskId: number): Promise<Attachment[]> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE}/tasks/${taskId}/attachments`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function uploadAttachment(taskId: number, file: File): Promise<Attachment> {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE}/tasks/${taskId}/attachments`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }
  return res.json();
}

export function getDownloadUrl(attachmentId: number): string {
  return `${BASE}/attachments/${attachmentId}/download`;
}

export async function deleteAttachment(attachmentId: number): Promise<void> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE}/attachments/${attachmentId}`, {
    method: "DELETE",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}
