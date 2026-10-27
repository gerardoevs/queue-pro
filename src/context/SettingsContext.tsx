'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { DEFAULT_SETTINGS, getSystemSettings } from '@/lib/firebase/firestore';
import type { SystemSettings } from '@/types';

interface SettingsContextType {
  settings: SystemSettings;
  companyName: string;
  loading: boolean;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: DEFAULT_SETTINGS,
  companyName: DEFAULT_SETTINGS.companyName,
  loading: true,
  refreshSettings: async () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await getSystemSettings();
      if (data) {
        setSettings(data);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 1. Initial fetch
    fetchSettings();

    // 2. Real-time subscription
    const docRef = doc(db, 'settings', 'general');
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...(snap.data() as SystemSettings),
          });
        }
        setLoading(false);
      },
      (err) => {
        // Non-blocking in case of offline/auth rules
        if (err.code !== 'permission-denied') {
          console.error('Error listening to system settings:', err);
        }
        setLoading(false);
      }
    );

    return () => unsub();
  }, [fetchSettings]);

  const companyName = settings?.companyName?.trim() || DEFAULT_SETTINGS.companyName || 'GEVS Queue Pro';

  // Synchronize document title with configured company name
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = `${companyName} | Sistema de Gestión de Turnos`;
    }
  }, [companyName]);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        companyName,
        loading,
        refreshSettings: fetchSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
