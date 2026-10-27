'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/context/AuthContext';
import { useBluetooth } from '@/context/BluetoothContext';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { createTicketTransaction, getSystemSettings, DEFAULT_SETTINGS } from '@/lib/firebase/firestore';
import type { Service, Branch, SystemSettings, Ticket } from '@/types';
import {
  Layers,
  Bluetooth,
  Printer,
  Sparkles,
  Clock,
  Users,
  CheckCircle2,
  AlertTriangle,
  Building2,
  LogOut,
  Maximize2,
  Minimize2,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { PrinterStatusButton } from '@/components/bluetooth/PrinterStatusButton';
import { PrinterModal } from '@/components/bluetooth/PrinterModal';

export default function KioskPage() {
  return (
    <AuthGuard allowedRoles={['kiosk', 'admin']}>
      <KioskContent />
    </AuthGuard>
  );
}

function KioskContent() {
  const { user, profile, logout } = useAuth();
  const {
    isConnected,
    deviceName,
    isConnecting,
    isReconnecting,
    connect,
    disconnect,
    printTicket,
    testPrint,
  } = useBluetooth();

  const [branch, setBranch] = useState<Branch | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [currentYear, setCurrentYear] = useState<number | null>(null);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState(false);

  // Success Modal State
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [peopleAhead, setPeopleAhead] = useState<number>(0);
  const [printStatus, setPrintStatus] = useState<'printing' | 'printed' | 'failed' | 'not_connected'>('not_connected');
  const [countdown, setCountdown] = useState<number>(6);

  // 1. Load System Settings in real time
  useEffect(() => {
    if (!user) return;
    getSystemSettings().then((s) => setSettings(s));
    const unsub = onSnapshot(
      doc(db, 'settings', 'general'),
      (snap) => {
        if (snap.exists()) {
          setSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as SystemSettings) });
        }
      },
      () => { }
    );
    return () => unsub();
  }, [user]);

  // 2. Load Branch
  useEffect(() => {
    if (!user || !profile) return;

    const targetBranchId = profile.branchId;

    const unsub = onSnapshot(
      collection(db, 'branches'),
      (snap) => {
        const list: Branch[] = [];
        snap.forEach((d) => list.push({ ...(d.data() as any), id: d.id }));

        if (targetBranchId) {
          const matched = list.find((b) => b.id === targetBranchId || b.name === targetBranchId);
          if (matched) {
            setBranch(matched);
            return;
          }
        }

        // Fallback to first active branch if none assigned or previous branch was removed
        const firstActive = list.find((b) => b.active) || list[0] || null;
        setBranch(firstActive);
        if (!firstActive) {
          setLoading(false);
        }
      },
      (err) => {
        if (err.code !== 'permission-denied') {
          console.error('Error listening to branches:', err);
        }
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user, profile?.branchId, profile]);

  // 3. Load Active Services for this Branch
  useEffect(() => {
    if (!user || !branch) return;

    const q = query(collection(db, 'services'), where('active', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Service[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data.branchIds?.includes(branch.id)) {
            list.push({ id: d.id, ...(data as any) });
          }
        });
        setServices(list);
        setLoading(false);
      },
      (err) => {
        if (err.code !== 'permission-denied') {
          console.error('Error listening to services:', err);
        }
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user, branch]);

  // 4. Modal Countdown Timer
  useEffect(() => {
    if (!activeTicket) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setActiveTicket(null);
          return 6;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeTicket]);

  // 5. Handle Service Touch / Ticket Generation
  const handleSelectService = async (service: Service) => {
    if (!branch || generating) return;
    setGenerating(true);

    try {
      // Atomic transaction in Firestore
      const result = await createTicketTransaction({
        branchId: branch.id,
        serviceId: service.id,
        serviceName: service.name,
        servicePrefix: service.prefix,
      });

      setActiveTicket(result.ticket);
      setPeopleAhead(result.peopleAhead);
      setCountdown(6);



      // Try printing via Bluetooth ESC/POS
      if (isConnected) {
        setPrintStatus('printing');
        const printSuccess = await printTicket(
          result.ticket,
          settings,
          branch.name,
          result.peopleAhead
        );
        setPrintStatus(printSuccess ? 'printed' : 'failed');
      } else {
        setPrintStatus('not_connected');
      }
    } catch (err: any) {
      console.error('Error generating ticket:', err);
      alert('Error al generar turno: ' + (err.message || 'Inténtelo nuevamente'));
    } finally {
      setGenerating(false);
    }
  };

  const handleRetryPrint = async () => {
    if (!activeTicket || !branch) return;
    if (!isConnected) {
      const connected = await connect();
      if (!connected) return;
    }
    setPrintStatus('printing');
    const success = await printTicket(activeTicket, settings, branch.name, peopleAhead);
    setPrintStatus(success ? 'printed' : 'failed');
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => { });
      setIsFullscreen(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between selection:bg-indigo-500 selection:text-white select-none">
      {/* Top Bar (Discreet, high-tech, mobile-friendly) */}
      <header className="px-4 py-3 sm:px-6 sm:py-4 bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 shrink-0">
            <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold text-sm sm:text-base tracking-tight text-white leading-tight truncate">
              {settings.companyName || 'GEVS QUEUE PRO'}
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-400 truncate">
              <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-400 shrink-0" />
              <span className="truncate">{branch ? branch.name : 'Cargando sucursal...'}</span>
            </div>
          </div>
        </div>

        {/* Status controls */}
        <div className="flex items-center gap-2 sm:gap-3 ml-auto">
          {/* Bluetooth Status Pill with modal trigger */}
          <PrinterStatusButton onOpenModal={() => setIsPrinterModalOpen(true)} />

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition cursor-pointer shrink-0"
            title="Pantalla Completa"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Logout */}
          <button
            onClick={() => logout()}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700/60 transition cursor-pointer shrink-0"
            title="Cerrar Sesión de Kiosko"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Touch Area */}
      <main className="flex-1 flex flex-col justify-center items-center px-4 py-6 sm:p-6 md:p-8 max-w-6xl mx-auto w-full">
        {/* Welcome message */}
        <div className="text-center mb-6 sm:mb-10 space-y-3">
          {(settings.logoSourceDataUrl || settings.logoDataUrl) && (
            <div className="flex justify-center mb-3 sm:mb-4">
              <div className="bg-white p-3 sm:p-4 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-200/80 inline-flex items-center justify-center">
                <img
                  src={settings.logoSourceDataUrl || settings.logoDataUrl}
                  alt={settings.companyName || 'Logo'}
                  className="max-h-20 sm:max-h-28 md:max-h-32 max-w-[220px] sm:max-w-[280px] object-contain"
                />
              </div>
            </div>
          )}
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white px-2">
            ¡Bienvenidos a <span>{settings.companyName}</span>!
          </h2>
          <p className="text-xs sm:text-sm md:text-base text-slate-400 max-w-lg mx-auto px-2">
            Por favor toque la opción de su preferencia en la pantalla para imprimir su turno.
          </p>
        </div>

        {/* Services Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16 sm:py-20 text-slate-400">
            <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 animate-spin text-indigo-500 mr-3" />
            <span className="text-base sm:text-lg">Cargando servicios disponibles...</span>
          </div>
        ) : services.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-6 sm:p-10 text-center max-w-md">
            <AlertTriangle className="w-10 h-10 sm:w-12 sm:h-12 text-amber-500 mx-auto mb-3" />
            <h3 className="text-base sm:text-lg font-bold text-white">No hay servicios habilitados</h3>
            <p className="text-xs text-slate-400 mt-2">
              No se encontraron servicios activos configurados para esta sucursal ({branch?.name}).
              Por favor contacte al administrador.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 w-full max-w-4xl mx-auto">
            {services.map((srv) => (
              <button
                key={srv.id}
                onClick={() => handleSelectService(srv)}
                disabled={generating}
                className="group relative bg-gradient-to-b from-slate-800/90 to-slate-900/90 hover:from-indigo-900/40 hover:to-slate-900 border-2 border-slate-700/80 hover:border-indigo-500 rounded-2xl sm:rounded-3xl p-5 sm:p-7 md:p-8 text-left shadow-2xl transition-all duration-200 transform hover:-translate-y-1 active:scale-95 disabled:opacity-50 cursor-pointer flex flex-col justify-between min-h-[140px] sm:min-h-[175px] md:min-h-[190px] overflow-hidden w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)]"
              >
                {/* Glow accent */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition" />

                <div className="flex items-start justify-between gap-3">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-extrabold font-mono text-lg sm:text-xl group-hover:bg-indigo-600 group-hover:text-white transition shadow-lg shrink-0">
                    {srv.prefix}
                  </div>
                  <span className="text-[11px] sm:text-xs font-mono font-bold text-slate-500 uppercase tracking-widest bg-slate-950/60 px-2.5 py-1 rounded-lg border border-slate-800">
                    Turno {srv.prefix}-###
                  </span>
                </div>

                <div className="mt-4">
                  <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-white group-hover:text-indigo-200 transition leading-snug">
                    {srv.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                    <span>Toque para solicitar turno</span>
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Discreet Footer */}
      <footer className="py-3 sm:py-4 px-4 text-center text-[11px] sm:text-xs text-slate-600 border-t border-slate-900">
        {settings.companyName || 'GEVS Queue Pro'} &copy; {currentYear || 2026} &bull; Terminal de Autoservicio
      </footer>

      {/* Ticket Success / Print Modal */}
      {activeTicket && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-slate-900 border-2 border-indigo-500/50 rounded-2xl sm:rounded-3xl w-full max-w-lg p-5 sm:p-8 shadow-2xl shadow-indigo-950/60 text-center relative overflow-y-auto max-h-[92vh]">
            {/* Top decorative gradient */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 bg-indigo-500/20 blur-3xl rounded-full pointer-events-none" />

            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto mb-3 sm:mb-4">
              <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>

            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              {activeTicket.serviceName}
            </span>

            <h3 className="text-slate-400 text-xs sm:text-sm mt-1">Su número de turno es:</h3>

            {/* Giant Ticket Number */}
            <div className="my-4 sm:my-5 py-3.5 sm:py-4 px-4 sm:px-6 bg-slate-950 rounded-2xl border-2 border-indigo-500/30 shadow-inner">
              <span className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white font-mono block break-all">
                {activeTicket.ticketNumber}
              </span>
            </div>

            {/* People Ahead info */}
            {settings.showQueueCount && (
              <div className="flex items-center justify-center gap-2 text-slate-300 text-xs sm:text-sm font-medium mb-4">
                <Users className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>
                  Personas en espera delante de usted:{' '}
                  <strong className="text-white font-bold">{peopleAhead}</strong>
                </span>
              </div>
            )}

            {/* Print feedback status */}
            <div className="mt-3 p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs">
              {printStatus === 'printing' && (
                <div className="flex items-center justify-center gap-2 text-indigo-300">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
                  <span>Imprimiendo su ticket térmico en la impresora...</span>
                </div>
              )}
              {printStatus === 'printed' && (
                <div className="flex items-center justify-center gap-2 text-emerald-400">
                  <Printer className="w-4 h-4 shrink-0" />
                  <span>¡Ticket impreso correctamente! Por favor tómelo de la ranura.</span>
                </div>
              )}
              {printStatus === 'not_connected' && (
                <div className="flex flex-col items-center gap-2 text-amber-300">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>Impresora no vinculada. Por favor tome nota o fotografía de su turno.</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                    <button
                      onClick={handleRetryPrint}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer"
                    >
                      <Bluetooth className="w-3.5 h-3.5" /> Conectar e Imprimir
                    </button>
                    <button
                      onClick={() => setIsPrinterModalOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" /> Panel de Impresora
                    </button>
                  </div>
                </div>
              )}
              {printStatus === 'failed' && (
                <div className="flex flex-col items-center gap-2 text-rose-300">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Hubo un problema al imprimir. Puede reintentar o conservar su número.</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                    <button
                      onClick={handleRetryPrint}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" /> Reintentar Impresión
                    </button>
                    <button
                      onClick={() => setIsPrinterModalOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/30 text-rose-200 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" /> Panel de Impresora
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Auto-close Countdown button */}
            <div className="mt-5 sm:mt-6 flex items-center justify-center">
              <button
                onClick={() => setActiveTicket(null)}
                className="w-full sm:w-auto justify-center px-6 sm:px-8 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-xl shadow-indigo-600/30 transition cursor-pointer flex items-center gap-2"
              >
                <span>Listo / Siguiente Cliente ({countdown}s)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printer Management Modal */}
      <PrinterModal
        isOpen={isPrinterModalOpen}
        onClose={() => setIsPrinterModalOpen(false)}
      />
    </div>
  );
}
