'use client';

import React from 'react';
import { SettingsProvider } from '@/context/SettingsContext';
import { AuthProvider } from '@/context/AuthContext';
import { BluetoothProvider } from '@/context/BluetoothContext';
import { ThemeProvider } from '@/context/ThemeContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <ThemeProvider>
        <AuthProvider>
          <BluetoothProvider>{children}</BluetoothProvider>
        </AuthProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
}
