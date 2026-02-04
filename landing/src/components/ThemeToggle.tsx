'use client';

import { useEffect, useState } from 'react';

export function useTheme() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check localStorage or system preference
    const stored = localStorage.getItem('automna-theme');
    if (stored) {
      setIsDark(stored === 'dark');
    } else {
      // Default to light mode for new visitors
      setIsDark(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('automna-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('automna-theme', 'light');
    }
  }, [isDark, mounted]);

  return { isDark, setIsDark, mounted };
}

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { isDark, setIsDark, mounted } = useTheme();

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <button className={`p-2 rounded-lg opacity-0 ${className}`} aria-label="Toggle theme">
        <div className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className={`p-2 rounded-lg transition-colors ${
        isDark 
          ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' 
          : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
      } ${className}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? (
        // Sun icon
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        // Moon icon
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}
