"use client";

import React, { createContext, ReactNode, useCallback, useContext, useMemo, useEffect, useState } from "react";

type ThemeMode = "light" | "dim";

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = "reading-retreat-theme";

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const applyThemeToDocument = (theme: ThemeMode) => {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.classList.toggle("dark", theme === "dim");
  document.documentElement.dataset.theme = theme;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeMode>("dim");

  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (storedTheme === "light" || storedTheme === "dim") {
        setThemeState(storedTheme);
        applyThemeToDocument(storedTheme);
        return;
      }
    } catch {
      // no-op
    }

    applyThemeToDocument("dim");
  }, []);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    applyThemeToDocument(nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // no-op
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dim" ? "light" : "dim");
  }, [setTheme, theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
    }),
    [setTheme, theme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemeMode = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeMode must be used within ThemeProvider");
  }
  return context;
};
