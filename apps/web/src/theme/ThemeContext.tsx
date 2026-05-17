import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { createTheme, type Theme } from "./theme";
import { useAuthStore } from "@/store/authStore";
import { updateProfile } from "@/api/auth";

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  accentColor: string;
  toggleTheme: () => void;
  setAccentColor: (color: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [accentColor, setAccentColor] = useState("#0EA5E9");
  const { user, token, setAuth } = useAuthStore();

  // Sync accent color from user object when session changes
  useEffect(() => {
    setAccentColor(user?.accent_color ?? "#0EA5E9");
  }, [user?.accent_color, user?.id]);

  // Sync dark mode from user object when session changes
  useEffect(() => {
    setIsDark(user?.is_dark ?? false);
  }, [user?.is_dark, user?.id]);

  const handleSetAccentColor = useCallback((color: string) => {
    setAccentColor(color);
  }, []);

  const theme = createTheme(isDark);

  // toggleTheme persists the preference to the server
  const toggleTheme = useCallback(() => {
    setIsDark((d) => {
      const next = !d;
      // Fire-and-forget persist to backend
      if (user && token) {
        updateProfile({ is_dark: next })
          .then((updated) => {
            setAuth(updated, token);
          })
          .catch(() => {/* silently ignore */});
      }
      return next;
    });
  }, [user, token, setAuth]);

  return (
    <ThemeContext.Provider value={{ theme, isDark, accentColor, toggleTheme, setAccentColor: handleSetAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
