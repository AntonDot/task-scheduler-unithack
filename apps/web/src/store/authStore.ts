import { create } from "zustand";
import type { User, ProjectRole } from "@/types/domain";
import { useLangStore } from "@/i18n";
import type { Language } from "@/i18n";

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
  setAuth: (user, token) => {
    set({ user, token });
    // Sync language from profile to i18n store
    if (user.language) {
      const stored = useLangStore.getState().language;
      if (stored !== user.language) {
        useLangStore.getState().setLanguage(user.language as Language);
      }
    }
  },
  setProjectRoles: (projectRoles) => set({ projectRoles }),
  clearAuth: () => {
    localStorage.removeItem("token");
    set({ user: null, token: null, projectRoles: {} });
  },
}));
