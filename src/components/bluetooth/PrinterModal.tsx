'use client';

import React, { useState, useEffect } from 'react';
import { useBluetooth } from '@/context/BluetoothContext';
import {
  Printer,
  Bluetooth,
  RefreshCw,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Loader2,
  Power,
  Radio,
  FileText,
  Cable,
} from 'lucide-react';

interface PrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PrinterModal({ isOpen, onClose }: PrinterModalProps) {
  const {
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
    connect,
    connectSerial,
    reconnect,
    cancelReconnect,
    disconnect,
    forget,
    testPrint,
  } = useBluetooth();

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [isForgetting, setIsForgetting] = useState(false);
  const [forgetNotice, setForgetNotice] = useState<string | null>(null);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset notices on open
  useEffect(() => {
    if (isOpen) {
      setTestResult(null);
      setForgetNotice(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestPrint = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const ok = await testPrint();
      setTestResult(ok ? 'success' : 'error');
    } catch {
      setTestResult('error');
    } finally {
      setIsTesting(false);
      setTimeout(() => setTestResult(null), 4000);
    }
  };

  const handleForget = async () => {
    setIsForgetting(true);
    setForgetNotice(null);
    try {
      await forget();
      setForgetNotice('Dispositivo olvidado correctamente. Ahora puedes vincular una impresora nueva.');
    } finally {
      setIsForgetting(false);
      setTimeout(() => setForgetNotice(null), 5000);
    }
  };

  const handleConnectFresh = async () => {
    setForgetNotice(null);
    await connect();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-100 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                Panel de Impresora Térmica
              </h2>
              <p className="text-xs text-slate-400">
                Gestión y solución de problemas Bluetooth ESC/POS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Web Bluetooth Support Warning */}
          {!isSupported && (
            <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-200">Navegador no compatible</p>
                <p className="mt-0.5 text-rose-300/80">
                  Web Bluetooth no está disponible en este navegador. Para imprimir por Bluetooth,
                  abre el sistema en <strong>Google Chrome</strong> o <strong>Microsoft Edge</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Forget Notice Alert */}
          {forgetNotice && (
            <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 text-xs flex items-center gap-2.5 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>{forgetNotice}</span>
            </div>
          )}

          {/* Current Connection Status Box */}
          <div className="rounded-2xl border p-4 transition-all duration-200 bg-slate-950/60 border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Estado Actual
              </span>

              {isConnected ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/80 border border-emerald-500/30 text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Conectada
                </span>
              ) : isReconnecting ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/80 border border-amber-500/30 text-amber-300">
                  <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                  Reconectando ({reconnectAttempts}/{maxReconnectAttempts})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 border border-slate-700 text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  Desconectada
                </span>
              )}
            </div>

            {/* Status Details */}
            {isConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {deviceName || 'Impresora Térmica'}
                    </h3>
                    <p className="text-xs text-emerald-400/90">
                      Dispositivo listo para emitir tickets térmicos.
                    </p>
                  </div>
                </div>

                {/* Test button & Disconnect */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                  <button
                    onClick={handleTestPrint}
                    disabled={isTesting}
                    className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    {isTesting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Imprimiendo prueba...</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-3.5 h-3.5" />
                        <span>Imprimir Ticket de Prueba</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={disconnect}
                    className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                    title="Desconectar impresora"
                  >
                    Desconectar
                  </button>
                </div>

                {testResult === 'success' && (
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    ¡Comando enviado con éxito a la impresora!
                  </p>
                )}
                {testResult === 'error' && (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Error al imprimir. Revisa el papel y el Bluetooth.
                  </p>
                )}
              </div>
            ) : isReconnecting ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                    <Radio className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-200">
                      Buscando impresora ({deviceName || 'Dispositivo guardado'})...
                    </h3>
                    <p className="text-xs text-amber-300/80 mt-0.5">
                      Intento {reconnectAttempts} de {maxReconnectAttempts}. El sistema intenta restablecer el enlace con la impresora.
                    </p>
                  </div>
                </div>

                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-amber-400 h-1.5 transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (reconnectAttempts / maxReconnectAttempts) * 100)}%`,
                    }}
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={cancelReconnect}
                    className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                  >
                    Detener búsqueda
                  </button>
                  <button
                    onClick={handleForget}
                    disabled={isForgetting}
                    className="py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Olvidar y reanudar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                    <Power className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {deviceName ? `Impresora: ${deviceName}` : 'Ninguna impresora vinculada'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {error ? (
                        <span className="text-rose-400">{error}</span>
                      ) : deviceName ? (
                        'La impresora no está conectada actualmente.'
                      ) : (
                        'Empareja una impresora térmica Bluetooth para imprimir turnos físicos.'
                      )}
                    </p>
                  </div>
                </div>

                {deviceName && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => reconnect()}
                      className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Reintentar conexión
                    </button>
                    <button
                      onClick={handleForget}
                      disabled={isForgetting}
                      className="py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Olvidar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions: Connect Serial / Connect BLE / Forget */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Opciones de Conexión
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Primary Connect Serial (COM/USB) Button - RECOMMENDED */}
              <button
                onClick={async () => {
                  setForgetNotice(null);
                  await connectSerial();
                }}
                disabled={isConnecting}
                className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-left transition shadow-lg shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2 font-bold text-xs">
                  <Cable className="w-4 h-4 text-emerald-100" />
                  <span>Conectar por Puerto COM / USB (Recomendado)</span>
                </div>
                <p className="text-[11px] text-emerald-100/90 mt-1">
                  Ideal si ya la vinculaste en Windows (puerto COM Bluetooth) o con cable USB. Conexión directa y 100% estable.
                </p>
              </button>

              {/* Bluetooth BLE Button */}
              <button
                onClick={handleConnectFresh}
                disabled={isConnecting}
                className="p-3.5 rounded-2xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/50 text-white text-left transition cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2 font-bold text-xs text-indigo-300">
                  <Bluetooth className="w-4 h-4" />
                  <span>Conectar vía Bluetooth BLE</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Enlace inalámbrico directo. Requiere que la impresora NO esté vinculada en la configuración de Windows.
                </p>
              </button>

              {/* Olvidar Dispositivo Button */}
              <button
                onClick={handleForget}
                disabled={isForgetting}
                className="sm:col-span-2 p-3 rounded-2xl bg-slate-950 hover:bg-rose-950/30 border border-slate-800 hover:border-rose-500/40 text-left transition cursor-pointer group disabled:opacity-50"
              >
                <div className="flex items-center gap-2 font-bold text-xs text-rose-400 group-hover:text-rose-300">
                  {isForgetting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  <span>Olvidar Dispositivo y Limpiar Memoria</span>
                </div>
                <p className="text-[11px] text-slate-400 group-hover:text-slate-300 mt-0.5">
                  Elimina los permisos anteriores del navegador para reiniciar la vinculación desde cero.
                </p>
              </button>
            </div>
          </div>

          {/* Collapsible Troubleshooting Guide */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
            <button
              onClick={() => setShowTroubleshooting((prev) => !prev)}
              className="w-full px-4 py-3 text-left flex items-center justify-between text-xs font-semibold text-slate-300 hover:bg-slate-800/40 transition cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-indigo-400" />
                ¿Por qué dice &quot;GATT Server is disconnected&quot; si está vinculada?
              </span>
              <span className="text-slate-500 text-xs">
                {showTroubleshooting ? 'Ocultar' : 'Ver explicación'}
              </span>
            </button>

            {showTroubleshooting && (
              <div className="px-4 pb-4 pt-1 space-y-2.5 text-xs text-slate-400 border-t border-slate-800/60 animate-in fade-in duration-150">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
                  <strong>El conflicto de Windows:</strong> Cuando emparejas la impresora en la Configuración de Windows, Windows toma el control exclusivo por <em>Bluetooth Clásico (Puerto Serie SPP)</em> y <strong>bloquea el canal BLE de Chrome</strong>.
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center shrink-0 text-[10px]">
                    A
                  </span>
                  <p>
                    <strong className="text-slate-200">Solución A (La más fácil):</strong> Usa el botón verde <strong>&quot;Conectar por Puerto COM / USB&quot;</strong> arriba. Chrome te mostrará la lista de puertos serie de Windows donde aparecerá tu impresora NETUM ya emparejada. Se conecta al instante.
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[10px]">
                    B
                  </span>
                  <p>
                    <strong className="text-slate-200">Solución B (Para BLE puro):</strong> Ve a <em>Configuración de Windows &gt; Dispositivos &gt; Bluetooth</em> y presiona <strong>Quitar dispositivo</strong> (desvincúlala de Windows). Luego apaga la impresora, enciéndela y pulsa <strong>&quot;Conectar vía Bluetooth BLE&quot;</strong>.
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-700 text-slate-300 font-bold flex items-center justify-center shrink-0 text-[10px]">
                    C
                  </span>
                  <p>
                    <strong className="text-slate-200">Suspensión de batería:</strong> Si la impresora pasa 2-3 minutos sin usarse, se apaga la radio BLE. Presiona el botón <em>FEED</em> o <em>Power</em> para despertarla antes de imprimir.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
