import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

export function useTheme() {
  // Always start with 'dark' on both server and client to avoid hydration mismatch.
  // After mount, sync from localStorage.
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const stored = localStorage.getItem('ai-news-theme') as Theme | null;
      if (stored === 'light' || stored === 'dark') {
        setTheme(stored);
      }
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('ai-news-theme', theme);
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme, mounted]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, toggleTheme };
}
