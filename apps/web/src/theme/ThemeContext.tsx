import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { createTheme, type Theme } from "./theme";
import { useAuthStore } from "@/store/authStore";

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  accentColor: string;
  toggleTheme: () => void;
  setAccentColor: (color: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false); // default: light mode
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem("accent_color") || "#6366F1");
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user?.accent_color) {
      setAccentColor(user.accent_color);
      localStorage.setItem("accent_color", user.accent_color);
    }
  }, [user?.accent_color]);

  const handleSetAccentColor = useCallback((color: string) => {
    setAccentColor(color);
    localStorage.setItem("accent_color", color);
  }, []);

  const theme = createTheme(isDark);

  const toggleTheme = useCallback(() => setIsDark((d) => !d), []);

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
