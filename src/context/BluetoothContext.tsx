'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getBluetoothPrinter, WebBLEPrinter, WebBluetoothPrinter, PrinterState } from '@/lib/bluetooth/printer';
import { getSystemSettings } from '@/lib/firebase/firestore';
import type { Ticket, SystemSettings } from '@/types';

interface BluetoothContextType {
  isConnected: boolean;
  deviceName?: string;
  connectionType: 'bluetooth' | 'serial' | null;
  isSupported: boolean;
  isSerialSupported: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  error: string | null;
  printer: WebBLEPrinter;
  connect: () => Promise<boolean>;
  connectSerial: () => Promise<boolean>;
  reconnect: () => Promise<boolean>;
  cancelReconnect: () => void;
  disconnect: () => void;
  forget: () => Promise<void>;
  printTicket: (
    ticket: Ticket,
    settings: SystemSettings,
    branchName?: string,
    peopleAhead?: number
  ) => Promise<boolean>;
  testPrint: (customSettings?: SystemSettings) => Promise<boolean>;
}

const BluetoothContext = createContext<BluetoothContextType | undefined>(undefined);

export function BluetoothProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string | undefined>(undefined);
  const [connectionType, setConnectionType] = useState<'bluetooth' | 'serial' | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isSerialSupported, setIsSerialSupported] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [maxReconnectAttempts, setMaxReconnectAttempts] = useState(10);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsSupported(WebBLEPrinter.isSupported());
    setIsSerialSupported(WebBLEPrinter.isSerialSupported());
    const printer = getBluetoothPrinter();
    const initialState = printer.getState();

    // Check if previous session had an active printer to show instant reconnecting state
    const savedAutoConnect =
      typeof localStorage !== 'undefined' ? localStorage.getItem('gevs_printer_auto_connect') : null;
    const savedName =
      typeof localStorage !== 'undefined' ? localStorage.getItem('gevs_printer_device_name') : null;
    const savedMode =
      typeof localStorage !== 'undefined' ? localStorage.getItem('gevs_printer_mode') : null;

    if (savedAutoConnect !== 'false' && (savedName || savedMode)) {
      setIsConnected(false);
      setDeviceName(savedName || 'Impresora Térmica');
      setConnectionType((savedMode as 'bluetooth' | 'serial') || null);
      setIsReconnecting(true);
      setReconnectAttempts(1);
    } else {
      setIsConnected(initialState.isConnected);
      setDeviceName(initialState.deviceName);
      setConnectionType(initialState.connectionType || null);
      setIsReconnecting(initialState.isReconnecting);
      setReconnectAttempts(initialState.reconnectAttempts);
    }
    setMaxReconnectAttempts(initialState.maxReconnectAttempts);

    // Listen to live connection & auto-reconnection events
    const unsubscribe = printer.onStateChange((state: PrinterState) => {
      setIsConnected(state.isConnected);
      setDeviceName(state.deviceName);
      setConnectionType(state.connectionType || null);
      setIsReconnecting(state.isReconnecting);
      setReconnectAttempts(state.reconnectAttempts);
      setMaxReconnectAttempts(state.maxReconnectAttempts);
      if (state.isConnected || state.isReconnecting) {
        setError(null);
      } else if (state.error) {
        setError(state.error);
      }
    });

    // Auto-connect to previously paired device if supported by the browser
    printer.autoConnectKnownDevice().catch(() => {});

    return () => unsubscribe();
  }, []);

  const connect = useCallback(async (): Promise<boolean> => {
    setIsConnecting(true);
    setError(null);
    try {
      const printer = getBluetoothPrinter();
      const success = await printer.connect();
      return success;
    } catch (err: any) {
      console.error('Bluetooth connection failed:', err);
      setError(err?.message || 'Error al conectar impresora Bluetooth');
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const connectSerial = useCallback(async (): Promise<boolean> => {
    setIsConnecting(true);
    setError(null);
    try {
      const printer = getBluetoothPrinter();
      const success = await printer.connectSerial();
      return success;
    } catch (err: any) {
      console.error('Serial connection failed:', err);
      setError(err?.message || 'Error al conectar por puerto serie / USB');
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const reconnect = useCallback(async (): Promise<boolean> => {
    setError(null);
    try {
      const printer = getBluetoothPrinter();
      return await printer.reconnect();
    } catch (err: any) {
      console.error('Bluetooth reconnect failed:', err);
      setError(err?.message || 'Error al reconectar impresora');
      return false;
    }
  }, []);

  const cancelReconnect = useCallback(() => {
    const printer = getBluetoothPrinter();
    printer.cancelReconnect();
    setIsReconnecting(false);
  }, []);

  const disconnect = useCallback(() => {
    const printer = getBluetoothPrinter();
    printer.disconnect();
    setIsConnected(false);
    setIsReconnecting(false);
    setConnectionType(null);
    setReconnectAttempts(0);
  }, []);

  const forget = useCallback(async (): Promise<void> => {
    try {
      const printer = getBluetoothPrinter();
      await printer.forget();
      setIsConnected(false);
      setIsReconnecting(false);
      setConnectionType(null);
      setReconnectAttempts(0);
      setDeviceName(undefined);
      setError(null);
    } catch (err: any) {
      console.error('Error forgetting device:', err);
    }
  }, []);

  const printTicket = useCallback(
    async (
      ticket: Ticket,
      settings: SystemSettings,
      branchName?: string,
      peopleAhead: number = 0
    ): Promise<boolean> => {
      const printer = getBluetoothPrinter();
      try {
        await printer.printTicketWithLibrary(ticket, settings, branchName, peopleAhead);
        return true;
      } catch (err: any) {
        console.error('Print ticket failed:', err);
        setError(err?.message || 'Error al enviar comando a la impresora');
        return false;
      }
    },
    []
  );

  const testPrint = useCallback(async (customSettings?: SystemSettings): Promise<boolean> => {
    const printer = getBluetoothPrinter();
    try {
      const activeSettings = customSettings ?? (await getSystemSettings().catch(() => null));
      await printer.printTestWithLibrary(activeSettings);
      return true;
    } catch (err: any) {
      console.error('Test print failed:', err);
      setError(err?.message || 'Error al imprimir prueba');
      return false;
    }
  }, []);

  return (
    <BluetoothContext.Provider
      value={{
        isConnected,
        deviceName,
        connectionType,
        isSupported,
        isSerialSupported,
        isConnecting,
        isReconnecting,
        reconnectAttempts,
        maxReconnectAttempts,
        error,
        printer: getBluetoothPrinter(),
        connect,
        connectSerial,
        reconnect,
        cancelReconnect,
        disconnect,
        forget,
        printTicket,
        testPrint,
      }}
    >
      {children}
    </BluetoothContext.Provider>
  );
}

export function useBluetooth() {
  const context = useContext(BluetoothContext);
  if (!context) {
    throw new Error('useBluetooth must be used within a BluetoothProvider');
  }
  return context;
}
