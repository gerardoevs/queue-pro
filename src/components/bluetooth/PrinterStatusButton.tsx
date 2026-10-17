'use client';

import React, { useState } from 'react';
import { useBluetooth } from '@/context/BluetoothContext';
import { PrinterModal } from './PrinterModal';
import { Printer, Bluetooth, Loader2, AlertCircle, ChevronDown, Trash2 } from 'lucide-react';

interface PrinterStatusButtonProps {
  className?: string;
  onOpenModal?: () => void;
}

export function PrinterStatusButton({ className = '', onOpenModal }: PrinterStatusButtonProps) {
  const {
    isConnected,
    deviceName,
    isConnecting,
    isReconnecting,
    reconnectAttempts,
    maxReconnectAttempts,
    error,
    forget,
  } = useBluetooth();

  const [internalModalOpen, setInternalModalOpen] = useState(false);

  const handleOpen = () => {
    if (onOpenModal) {
      onOpenModal();
    } else {
      setInternalModalOpen(true);
    }
  };

  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Connected Pill */}
        {isConnected ? (
          <button
            onClick={handleOpen}
            className="group flex items-center gap-1.5 sm:gap-2 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/30 hover:border-emerald-500/50 px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs text-emerald-300 transition cursor-pointer shadow-sm shadow-emerald-950/40"
            title="Gestionar Impresora Térmica"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <Printer className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium max-w-[95px] sm:max-w-[140px] truncate">
              {deviceName || 'Impresora Lista'}
            </span>
            <ChevronDown className="w-3 h-3 text-emerald-400/70 group-hover:text-emerald-300 transition shrink-0" />
          </button>
        ) : isReconnecting ? (
          /* Reconnecting Pill with quick Olvidar */
          <div className="flex items-center gap-1.5 bg-amber-950/60 border border-amber-500/40 rounded-full px-2.5 sm:px-3 py-1 text-xs text-amber-300 animate-pulse">
            <button
              onClick={handleOpen}
              className="flex items-center gap-1.5 sm:gap-2 cursor-pointer hover:text-amber-200"
              title="Click para abrir panel de impresora"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
              <span className="truncate">
                <span className="hidden sm:inline">Reconectando </span>({reconnectAttempts}/{maxReconnectAttempts})
              </span>
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                await forget();
              }}
              className="ml-1 px-2 py-0.5 rounded-full bg-amber-900/70 hover:bg-rose-900/80 hover:text-rose-200 text-amber-300 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 shrink-0"
              title="Olvidar dispositivo y cancelar reconexión"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">Olvidar</span>
            </button>
          </div>
        ) : error ? (
          /* Error / Lost Connection Pill */
          <button
            onClick={handleOpen}
            className="flex items-center gap-1.5 sm:gap-2 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/40 px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs text-rose-300 transition cursor-pointer"
            title={error}
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="hidden sm:inline">Impresora Desconectada</span>
            <span className="sm:hidden">Sin Impresora</span>
            <ChevronDown className="w-3 h-3 text-rose-400/70 shrink-0" />
          </button>
        ) : (
          /* Default Disconnected Button */
          <button
            onClick={handleOpen}
            disabled={isConnecting}
            className="flex items-center gap-1.5 sm:gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs text-slate-200 transition cursor-pointer"
          >
            <Bluetooth className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>
              {isConnecting ? (
                'Conectando...'
              ) : (
                <>
                  <span className="hidden sm:inline">Conectar </span>Impresora
                </>
              )}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>
        )}
      </div>

      {!onOpenModal && (
        <PrinterModal
          isOpen={internalModalOpen}
          onClose={() => setInternalModalOpen(false)}
        />
      )}
    </>
  );
}
