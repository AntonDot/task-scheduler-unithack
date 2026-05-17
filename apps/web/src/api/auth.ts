import { api } from "./client";

interface TokenResponse {
  access_token: string;
  token_type: string;
}

interface LoginMode {
  dev_login: boolean;
}

export async function getLoginMode(): Promise<LoginMode> {
  return api.get<LoginMode>("/auth/mode");
}

export async function login(email: string, password?: string): Promise<string> {
  const body: Record<string, string> = { email };
  if (password) body.password = password;
  const data = await api.post<TokenResponse>("/auth/token", body);
  localStorage.setItem("token", data.access_token);
  return data.access_token;
}

export function logout(): void {
  localStorage.removeItem("token");
}

import type { User } from "@/types/domain";

export function updateProfile(body: { 
  full_name?: string; 
  email?: string; 
  accent_color?: string; 
  avatar_data?: string; 
  is_dark?: boolean; 
  language?: string;
  notification_settings?: Record<string, boolean> | null;
}): Promise<User> {
  return api.patch('/auth/me', body);
}
