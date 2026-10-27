'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { updateSystemSettings } from '@/lib/firebase/firestore';

export type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode, persistToFirestore?: boolean) => Promise<void>;
  toggleTheme: (persistToFirestore?: boolean) => Promise<void>;
}

const STORAGE_KEY = 'queue-pro-theme';

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: async (newTheme: ThemeMode, persistToFirestore = false) => {
    applyThemeToDOM(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {}
    if (persistToFirestore) {
      try {
        await updateSystemSettings({ theme: newTheme });
      } catch (err) {
        console.error('Error saving theme to Firestore:', err);
      }
    }
  },
  toggleTheme: async (persistToFirestore = false) => {
    const current =
      (typeof localStorage !== 'undefined' && (localStorage.getItem(STORAGE_KEY) as ThemeMode)) ||
      'dark';
    const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
    applyThemeToDOM(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    if (persistToFirestore) {
      try {
        await updateSystemSettings({ theme: next });
      } catch (err) {
        console.error('Error saving theme to Firestore:', err);
      }
    }
  },
});

const LIGHT_VARS: Record<string, string> = {
  '--background': '#f1f5f9',
  '--foreground': '#0f172a',
  '--color-slate-950': '#f1f5f9',
  '--color-slate-900': '#ffffff',
  '--color-slate-800': '#e2e8f0',
  '--color-slate-700': '#cbd5e1',
  '--color-slate-600': '#94a3b8',
  '--color-slate-500': '#64748b',
  '--color-slate-400': '#475569',
  '--color-slate-300': '#334155',
  '--color-slate-200': '#1e293b',
  '--color-slate-100': '#0f172a',
  '--color-slate-50': '#020617',
  '--color-indigo-950': '#eef2ff',
  '--color-indigo-900': '#e0e7ff',
  '--color-indigo-400': '#4f46e5',
  '--color-indigo-300': '#4338ca',
  '--color-indigo-200': '#3730a3',
  '--color-emerald-950': '#ecfdf5',
  '--color-emerald-900': '#d1fae5',
  '--color-emerald-400': '#059669',
  '--color-emerald-300': '#047857',
  '--color-emerald-200': '#065f46',
  '--color-amber-950': '#fffbeb',
  '--color-amber-900': '#fef3c7',
  '--color-amber-400': '#d97706',
  '--color-amber-300': '#b45309',
  '--color-amber-200': '#92400e',
  '--color-rose-950': '#fff1f2',
  '--color-rose-900': '#ffe4e6',
  '--color-rose-400': '#e11d48',
  '--color-rose-300': '#be123c',
  '--color-rose-200': '#9f1239',
  '--color-blue-950': '#eff6ff',
  '--color-blue-900': '#dbeafe',
  '--color-blue-400': '#2563eb',
  '--color-blue-300': '#1d4ed8',
  '--color-blue-200': '#1e40af',
  '--color-purple-950': '#faf5ff',
  '--color-purple-900': '#f3e8ff',
  '--color-purple-400': '#9333ea',
  '--color-purple-300': '#7e22ce',
  '--color-purple-200': '#6b21a8',
  '--color-violet-400': '#7c3aed',
};

export const THEME_OVERRIDES_CSS = `
html.light,
html[data-theme="light"] {
  --background: #f1f5f9 !important;
  --foreground: #0f172a !important;
  --color-slate-950: #f1f5f9 !important;
  --color-slate-900: #ffffff !important;
  --color-slate-800: #e2e8f0 !important;
  --color-slate-700: #cbd5e1 !important;
  --color-slate-600: #94a3b8 !important;
  --color-slate-500: #64748b !important;
  --color-slate-400: #475569 !important;
  --color-slate-300: #334155 !important;
  --color-slate-200: #1e293b !important;
  --color-slate-100: #0f172a !important;
  --color-slate-50: #020617 !important;

  --color-indigo-950: #eef2ff !important;
  --color-indigo-900: #e0e7ff !important;
  --color-indigo-400: #4f46e5 !important;
  --color-indigo-300: #4338ca !important;
  --color-indigo-200: #3730a3 !important;

  --color-emerald-950: #ecfdf5 !important;
  --color-emerald-900: #d1fae5 !important;
  --color-emerald-400: #059669 !important;
  --color-emerald-300: #047857 !important;
  --color-emerald-200: #065f46 !important;

  --color-amber-950: #fffbeb !important;
  --color-amber-900: #fef3c7 !important;
  --color-amber-400: #d97706 !important;
  --color-amber-300: #b45309 !important;
  --color-amber-200: #92400e !important;

  --color-rose-950: #fff1f2 !important;
  --color-rose-900: #ffe4e6 !important;
  --color-rose-400: #e11d48 !important;
  --color-rose-300: #be123c !important;
  --color-rose-200: #9f1239 !important;

  --color-blue-950: #eff6ff !important;
  --color-blue-900: #dbeafe !important;
  --color-blue-400: #2563eb !important;
  --color-blue-300: #1d4ed8 !important;
  --color-blue-200: #1e40af !important;

  --color-purple-950: #faf5ff !important;
  --color-purple-900: #f3e8ff !important;
  --color-purple-400: #9333ea !important;
  --color-purple-300: #7e22ce !important;
  --color-purple-200: #6b21a8 !important;

  --color-violet-400: #7c3aed !important;
}

/* Explicit surface overrides for Light Mode */
html.light body,
html.light .bg-slate-950 {
  background-color: #f1f5f9 !important;
  color: #0f172a !important;
}

html.light .bg-slate-900,
html.light .bg-slate-900\\/95,
html.light .bg-slate-900\\/90,
html.light .bg-slate-900\\/80 {
  background-color: #ffffff !important;
}

html.light .bg-slate-900\\/60,
html.light .bg-slate-900\\/50,
html.light .bg-slate-900 .bg-slate-950,
html.light .bg-slate-950\\/80,
html.light .bg-slate-950\\/70,
html.light .bg-slate-950\\/60,
html.light .bg-slate-950\\/50,
html.light .bg-slate-950\\/40 {
  background-color: #f8fafc !important;
}

html.light .bg-slate-800,
html.light .bg-slate-800\\/80,
html.light .bg-slate-800\\/70,
html.light .bg-slate-800\\/60,
html.light .bg-slate-800\\/50,
html.light .bg-slate-800\\/30 {
  background-color: #e2e8f0 !important;
}

html.light .hover\\:bg-slate-800:hover,
html.light .hover\\:bg-slate-800\\/80:hover,
html.light .hover\\:bg-slate-800\\/70:hover,
html.light .hover\\:bg-slate-800\\/40:hover,
html.light .hover\\:bg-slate-800\\/30:hover {
  background-color: #e2e8f0 !important;
}

html.light .hover\\:bg-slate-700:hover {
  background-color: #cbd5e1 !important;
}

/* Explicit border & divider overrides for Light Mode */
html.light .border-slate-800,
html.light .border-slate-800\\/80,
html.light .border-slate-800\\/60,
html.light .border-slate-800\\/50,
html.light .border-slate-900 {
  border-color: #e2e8f0 !important;
}

html.light .border-slate-700,
html.light .border-slate-700\\/80,
html.light .border-slate-700\\/70,
html.light .border-slate-700\\/60,
html.light .border-slate-700\\/50 {
  border-color: #cbd5e1 !important;
}

html.light .divide-slate-800\\/60 > :not(:last-child) {
  border-color: #e2e8f0 !important;
}

/* Explicit typography overrides for Light Mode */
html.light .text-white,
html.light .text-slate-100 {
  color: #0f172a !important;
}

html.light .text-slate-200 {
  color: #1e293b !important;
}

html.light .text-slate-300 {
  color: #334155 !important;
}

html.light .text-slate-400 {
  color: #475569 !important;
}

html.light .text-slate-500 {
  color: #64748b !important;
}

html.light .text-slate-600 {
  color: #94a3b8 !important;
}

html.light .hover\\:text-white:hover,
html.light .hover\\:text-slate-200:hover {
  color: #0f172a !important;
}

/* Semantic badge & tint overrides for Light Mode */
html.light .bg-indigo-950,
html.light .bg-indigo-950\\/40,
html.light .bg-indigo-950\\/50,
html.light .bg-indigo-950\\/60 {
  background-color: #eef2ff !important;
}

html.light .text-indigo-400 {
  color: #4f46e5 !important;
}

html.light .text-indigo-300,
html.light .text-indigo-200 {
  color: #4338ca !important;
}

html.light .bg-emerald-950,
html.light .bg-emerald-950\\/40,
html.light .bg-emerald-950\\/50,
html.light .bg-emerald-950\\/60,
html.light .bg-emerald-950\\/80 {
  background-color: #ecfdf5 !important;
}

html.light .text-emerald-400 {
  color: #059669 !important;
}

html.light .text-emerald-300,
html.light .text-emerald-200 {
  color: #047857 !important;
}

html.light .bg-amber-950\\/50,
html.light .bg-amber-950\\/60,
html.light .bg-amber-950\\/80 {
  background-color: #fffbeb !important;
}

html.light .text-amber-400 {
  color: #d97706 !important;
}

html.light .text-amber-300,
html.light .text-amber-200 {
  color: #b45309 !important;
}

html.light .bg-rose-950\\/40,
html.light .bg-rose-950\\/50,
html.light .bg-rose-950\\/60 {
  background-color: #fff1f2 !important;
}

html.light .text-rose-400 {
  color: #e11d48 !important;
}

html.light .text-rose-300,
html.light .text-rose-200 {
  color: #be123c !important;
}

html.light .bg-blue-950\\/50,
html.light .bg-blue-950\\/60 {
  background-color: #eff6ff !important;
}

html.light .text-blue-400 {
  color: #2563eb !important;
}

html.light .text-blue-300,
html.light .text-blue-200 {
  color: #1d4ed8 !important;
}

html.light .bg-purple-950\\/60 {
  background-color: #faf5ff !important;
}

html.light .text-purple-300,
html.light .text-purple-200 {
  color: #7e22ce !important;
}

/* Kiosk service card gradient in Light Mode */
html.light .from-slate-800\\/90.to-slate-900\\/90 {
  background-image: linear-gradient(to bottom, #ffffff, #f8fafc) !important;
}

html.light .from-slate-800\\/90.to-slate-900\\/90:hover {
  background-image: linear-gradient(to bottom, #eef2ff, #ffffff) !important;
}

/* Keep white text inside solid/gradient accent buttons & active nav items */
html.light .bg-indigo-600,
html.light .bg-indigo-600.text-white,
html.light .bg-indigo-600 .text-white,
html.light .bg-indigo-600 span,
html.light .bg-indigo-600 svg,
html.light .bg-emerald-600,
html.light .bg-emerald-600.text-white,
html.light .bg-emerald-600 .text-white,
html.light .bg-emerald-600 span,
html.light .bg-emerald-600 svg,
html.light .bg-blue-600,
html.light .bg-blue-600.text-white,
html.light .bg-blue-600 .text-white,
html.light .bg-blue-600 span,
html.light .bg-blue-600 svg,
html.light .bg-purple-600,
html.light .bg-purple-600.text-white,
html.light .bg-purple-600 .text-white,
html.light .bg-purple-600 span,
html.light .bg-purple-600 svg,
html.light .from-indigo-600,
html.light .from-indigo-600.text-white,
html.light .from-indigo-600 .text-white,
html.light .from-indigo-600 span,
html.light .from-indigo-600 svg,
html.light .from-emerald-600,
html.light .from-emerald-600.text-white,
html.light .from-emerald-600 .text-white,
html.light .from-emerald-600 span,
html.light .from-emerald-600 svg,
html.light .group:hover .group-hover\\:bg-indigo-600.group-hover\\:text-white {
  color: #ffffff !important;
}

html.light input:not([type="checkbox"]):not([type="range"]),
html.light select,
html.light textarea {
  background-color: #f8fafc !important;
  color: #0f172a !important;
  border-color: #cbd5e1 !important;
}

html.light select option {
  background-color: #ffffff !important;
  color: #0f172a !important;
}

html.light .shadow-xl,
html.light .shadow-2xl {
  --tw-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.07), 0 2px 6px -1px rgba(15, 23, 42, 0.04) !important;
  box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow) !important;
}

html.light div.fixed.inset-0.backdrop-blur-sm,
html.light div.fixed.inset-0.backdrop-blur-md {
  background-color: rgba(15, 23, 42, 0.5) !important;
}

.thermal-ticket-paper {
  --color-slate-950: #020617 !important;
  --color-slate-900: #0f172a !important;
  --color-slate-800: #1e293b !important;
  --color-slate-700: #334155 !important;
  --color-slate-600: #475569 !important;
  --color-slate-500: #64748b !important;
  --color-slate-400: #94a3b8 !important;
  --color-slate-300: #cbd5e1 !important;
  background-color: #fffbeb !important;
  color: #0f172a !important;
}
`;

function ensureStyleElement() {
  if (typeof document === 'undefined') return;
  const id = 'queue-pro-theme-overrides';
  let styleEl = document.getElementById(id) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = id;
    document.head.appendChild(styleEl);
  }
  if (styleEl.textContent !== THEME_OVERRIDES_CSS) {
    styleEl.textContent = THEME_OVERRIDES_CSS;
  }
}

export function applyThemeToDOM(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  ensureStyleElement();

  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
  root.setAttribute('data-theme', mode);
  root.style.colorScheme = mode;

  if (document.body) {
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(mode);
  }

  if (mode === 'light') {
    Object.entries(LIGHT_VARS).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });
  } else {
    Object.keys(LIGHT_VARS).forEach((key) => {
      root.style.removeProperty(key);
    });
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('dark');

  // 1. Load cached theme immediately from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (saved === 'light' || saved === 'dark') {
        setThemeState(saved);
        applyThemeToDOM(saved);
      } else {
        applyThemeToDOM('dark');
      }
    } catch {
      applyThemeToDOM('dark');
    }
  }, []);

  // 2. Listen in real-time to Firestore general settings ('settings/general')
  useEffect(() => {
    const docRef = doc(db, 'settings', 'general');
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data?.theme === 'light' || data?.theme === 'dark') {
            const remoteTheme: ThemeMode = data.theme;
            setThemeState(remoteTheme);
            applyThemeToDOM(remoteTheme);
            try {
              localStorage.setItem(STORAGE_KEY, remoteTheme);
            } catch {}
          }
        }
      },
      (err) => {
        // Ignore permission-denied when user is not yet authenticated on /login
        if (err.code !== 'permission-denied') {
          console.error('Error listening to theme settings:', err);
        }
      }
    );

    return () => unsub();
  }, []);

  const setTheme = useCallback(async (newTheme: ThemeMode, persistToFirestore = false) => {
    setThemeState(newTheme);
    applyThemeToDOM(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {}

    if (persistToFirestore) {
      try {
        await updateSystemSettings({ theme: newTheme });
      } catch (err) {
        console.error('Error saving theme to Firestore:', err);
      }
    }
  }, []);

  const toggleTheme = useCallback(
    async (persistToFirestore = false) => {
      const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
      await setTheme(next, persistToFirestore);
    },
    [theme, setTheme]
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <style id="queue-pro-theme-inline" dangerouslySetInnerHTML={{ __html: THEME_OVERRIDES_CSS }} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
