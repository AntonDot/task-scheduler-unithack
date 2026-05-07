import { api } from "./client";

interface TokenResponse {
  access_token: string;
  token_type: string;
}

export async function login(email: string): Promise<string> {
  const data = await api.post<TokenResponse>("/auth/token", { email });
  localStorage.setItem("token", data.access_token);
  return data.access_token;
}

export function logout(): void {
  localStorage.removeItem("token");
}
