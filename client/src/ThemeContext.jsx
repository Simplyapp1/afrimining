import React, { createContext, useContext, useCallback, useLayoutEffect, useState } from 'react';

const STORAGE_KEY = 'simplyapp-theme';
const LEGACY_THEME_KEY = 'thinkers-theme';

const ThemeContext = createContext(null);

function readStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_THEME_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch (_) {}
  // Default light — matches the app before dark mode existed (do not follow OS preference).
  return 'light';
}

function applyDomTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStoredTheme());

  useLayoutEffect(() => {
    applyDomTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
      localStorage.removeItem(LEGACY_THEME_KEY);
    } catch (_) {}
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(next === 'dark' ? 'dark' : 'light');
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
