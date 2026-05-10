import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { createTheme, type Theme } from "./theme";

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
  const [accentColor, setAccentColor] = useState("#6366F1");

  const theme = createTheme(isDark);

  const toggleTheme = useCallback(() => setIsDark((d) => !d), []);

  return (
    <ThemeContext.Provider value={{ theme, isDark, accentColor, toggleTheme, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
