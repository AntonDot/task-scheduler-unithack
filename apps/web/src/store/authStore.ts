import { create } from "zustand";
import type { User, ProjectRole } from "@/types/domain";

interface AuthState {
  user: User | null;
  token: string | null;
  projectRoles: Record<number, ProjectRole>;
  setAuth: (user: User, token: string) => void;
  setProjectRoles: (roles: Record<number, ProjectRole>) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  projectRoles: {},
  setAuth: (user, token) => set({ user, token }),
  setProjectRoles: (projectRoles) => set({ projectRoles }),
  clearAuth: () => {
    localStorage.removeItem("token");
    set({ user: null, token: null, projectRoles: {} });
  },
}));
