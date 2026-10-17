'use client';

import React from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { BluetoothProvider } from '@/context/BluetoothContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <BluetoothProvider>{children}</BluetoothProvider>
    </AuthProvider>
  );
}
