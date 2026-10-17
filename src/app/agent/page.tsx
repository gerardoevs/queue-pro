'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/context/AuthContext';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { getTodayDateString, formatTime } from '@/lib/utils';
import { playQueueChime } from '@/lib/audio/chime';
import type { Ticket, Counter, Branch, Service } from '@/types';
import {
  MonitorCheck,
  Building2,
  Users,
  PhoneCall,
  Volume2,
  Play,
  CheckCircle,
  UserX,
  Clock,
  LogOut,
  AlertCircle,
  Loader2,
  ArrowRight,
  Sparkles,
  ChevronRight,
  Layers,
} from 'lucide-react';

export default function AgentPage() {
  return (
    <AuthGuard allowedRoles={['agent', 'admin']}>
      <AgentConsole />
    </AuthGuard>
  );
}

function AgentConsole() {
  const { user, profile, logout } = useAuth();
  const [todayDateString, setTodayDateString] = useState<string>('');

  useEffect(() => {
    setTodayDateString(getTodayDateString());
  }, []);

  const [counters, setCounters] = useState<Counter[]>([]);
  const [selectedCounterId, setSelectedCounterId] = useState<string>('');
  const [branch, setBranch] = useState<Branch | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Attention elapsed timer (seconds)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // 1. Determine active branch
  const activeBranchId = profile?.branchId;

  // 2. Load branch info
  useEffect(() => {
    if (!user || !profile) return;

    const unsub = onSnapshot(
      collection(db, 'branches'),
      (snap) => {
        const list: Branch[] = [];
        snap.forEach((d) => list.push({ ...(d.data() as any), id: d.id }));

        if (activeBranchId) {
          const matched = list.find((b) => b.id === activeBranchId || b.name === activeBranchId);
          if (matched) {
            setBranch(matched);
            return;
          }
        }

        const firstActive = list.find((b) => b.active) || list[0] || null;
        setBranch(firstActive);
        if (!firstActive) {
          setLoading(false);
        }
      },
      (err) => {
        if (err.code !== 'permission-denied') console.error('Error listening to branches:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user, profile, activeBranchId]);

  // 3. Load counters for this branch
  useEffect(() => {
    const branchIdToQuery = activeBranchId || branch?.id;
    if (!user || !branchIdToQuery) return;

    const q = query(
      collection(db, 'counters'),
      where('branchId', '==', branchIdToQuery),
      where('active', '==', true)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Counter[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setCounters(list);

        // Select default counter if available
        if (list.length > 0) {
          setSelectedCounterId((prev) => {
            if (prev && list.some((c) => c.id === prev)) return prev;
            if (profile?.defaultCounterId && list.some((c) => c.id === profile.defaultCounterId)) {
              return profile.defaultCounterId;
            }
            return list[0].id;
          });
        }
        setLoading(false);
      },
      (err) => {
        if (err.code !== 'permission-denied') console.error('Error listening to counters:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user, activeBranchId, branch?.id, profile?.defaultCounterId]);

  // 4. Load services
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      collection(db, 'services'),
      (snap) => {
        const list: Service[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setServices(list);
      },
      (err) => {
        if (err.code !== 'permission-denied') console.error('Error listening to services:', err);
      }
    );
    return () => unsub();
  }, [user]);

  // 5. Active counter object
  const activeCounter = useMemo(() => {
    return counters.find((c) => c.id === selectedCounterId) || null;
  }, [counters, selectedCounterId]);

  // 6. Listen to today's tickets for this branch in real time
  useEffect(() => {
    const branchIdToQuery = activeBranchId || branch?.id;
    if (!user || !branchIdToQuery || !todayDateString) return;

    const q = query(
      collection(db, 'tickets'),
      where('branchId', '==', branchIdToQuery),
      where('dateString', '==', todayDateString)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Ticket[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setTickets(list);
      },
      (err) => {
        if (err.code !== 'permission-denied') console.error('Error listening to tickets:', err);
      }
    );

    return () => unsub();
  }, [user, activeBranchId, branch?.id, todayDateString]);

  // 7. Active ticket currently assigned to this counter (calling or serving)
  const currentTicket = useMemo(() => {
    if (!activeCounter) return null;
    return (
      tickets.find(
        (t) =>
          t.counterId === activeCounter.id &&
          (t.status === 'calling' || t.status === 'serving')
      ) || null
    );
  }, [tickets, activeCounter]);

  // 8. Waiting queue: tickets with status 'waiting' matching activeCounter's services, sorted FIFO
  const waitingQueue = useMemo(() => {
    if (!activeCounter || !activeCounter.serviceIds) return [];
    const allowed = new Set(activeCounter.serviceIds);

    return tickets
      .filter((t) => t.status === 'waiting' && allowed.has(t.serviceId))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [tickets, activeCounter]);

  // 9. Completed today by this agent
  const myCompletedCount = useMemo(() => {
    return tickets.filter(
      (t) => t.agentId === profile?.uid && t.status === 'completed'
    ).length;
  }, [tickets, profile?.uid]);

  // 10. Elapsed serving timer
  useEffect(() => {
    if (currentTicket && currentTicket.status === 'serving' && currentTicket.startedAt) {
      const updateTimer = () => {
        const diff = Math.floor((Date.now() - currentTicket.startedAt!) / 1000);
        setElapsedSeconds(Math.max(0, diff));
      };
      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsedSeconds(0);
    }
  }, [currentTicket]);

  const formatElapsed = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // ACTIONS
  // A. Call Next
  const handleCallNext = async () => {
    if (!activeCounter || waitingQueue.length === 0 || actionLoading) return;
    const nextTicket = waitingQueue[0];
    setActionLoading(true);

    try {
      const now = Date.now();
      await updateDoc(doc(db, 'tickets', nextTicket.id), {
        status: 'calling',
        counterId: activeCounter.id,
        counterName: activeCounter.name,
        agentId: profile?.uid,
        agentName: profile?.name,
        calledAt: now,
        lastCalledAt: now,
      });

      playQueueChime();
    } catch (err) {
      console.error('Error calling next ticket:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // B. Recall
  const handleRecall = async () => {
    if (!currentTicket || actionLoading) return;
    setActionLoading(true);

    try {
      await updateDoc(doc(db, 'tickets', currentTicket.id), {
        lastCalledAt: Date.now(),
      });
      playQueueChime();
    } catch (err) {
      console.error('Error recalling ticket:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // C. Start Serving
  const handleStartServing = async () => {
    if (!currentTicket || actionLoading) return;
    setActionLoading(true);

    try {
      await updateDoc(doc(db, 'tickets', currentTicket.id), {
        status: 'serving',
        startedAt: Date.now(),
      });
    } catch (err) {
      console.error('Error starting attention:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // D. Complete
  const handleComplete = async () => {
    if (!currentTicket || actionLoading) return;
    setActionLoading(true);

    try {
      await updateDoc(doc(db, 'tickets', currentTicket.id), {
        status: 'completed',
        completedAt: Date.now(),
      });
    } catch (err) {
      console.error('Error completing ticket:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // E. No Show / Skip
  const handleNoShow = async () => {
    if (!currentTicket || actionLoading) return;
    if (!confirm(`¿Marcar el turno ${currentTicket.ticketNumber} como ausente / no se presentó?`)) return;
    setActionLoading(true);

    try {
      await updateDoc(doc(db, 'tickets', currentTicket.id), {
        status: 'skipped',
        completedAt: Date.now(),
      });
    } catch (err) {
      console.error('Error marking no show:', err);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Top Operating Bar */}
      <header className="px-4 py-3 sm:px-6 sm:py-4 bg-slate-900 border-b border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4 sticky top-0 z-30 shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 shrink-0">
              <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-extrabold text-sm sm:text-base tracking-tight text-white leading-tight truncate">
                GEVS Queue Pro <span className="hidden sm:inline">&bull; Consola de Atención</span>
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-slate-400">
                <span className="flex items-center gap-1 truncate">
                  <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate">{branch ? branch.name : 'Sucursal'}</span>
                </span>
                <span className="text-slate-600">&bull;</span>
                <span className="text-slate-300 font-medium truncate">
                  {profile?.name}
                </span>
              </div>
            </div>
          </div>

          {/* Mobile Logout Button */}
          <button
            onClick={() => logout()}
            className="md:hidden p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700/60 transition cursor-pointer shrink-0"
            title="Cerrar Sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Counter Picker & Session */}
        <div className="flex flex-wrap items-center justify-between md:justify-end gap-2 sm:gap-3">
          <div className="flex-1 sm:flex-initial flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 min-w-0">
            <MonitorCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs text-slate-400 font-medium shrink-0">Ventanilla:</span>
            <select
              value={selectedCounterId}
              onChange={(e) => setSelectedCounterId(e.target.value)}
              className="w-full sm:w-auto bg-transparent text-xs font-bold text-slate-100 focus:outline-none cursor-pointer truncate"
            >
              {counters.length === 0 ? (
                <option value="">Sin ventanillas configuradas</option>
              ) : (
                counters.map((c) => (
                  <option key={c.id} value={c.id} className="bg-slate-900">
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-800/80 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-700 text-xs shrink-0">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-slate-300">
              <span className="hidden xs:inline">Atendidos </span>hoy:{' '}
              <strong className="text-white">{myCompletedCount}</strong>
            </span>
          </div>

          <button
            onClick={() => logout()}
            className="hidden md:flex p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700/60 transition cursor-pointer"
            title="Cerrar Sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Two-Column Console Layout */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 items-start">
        {/* Left Column: Active Call / Serving Workstation (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Active Station Card */}
          <div className="bg-slate-900 border-2 border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-2xl relative overflow-hidden">
            {/* Background ambient glow */}
            <div
              className={`absolute top-0 right-0 w-64 sm:w-80 h-64 sm:h-80 rounded-full blur-3xl pointer-events-none transition-all duration-500 ${
                currentTicket?.status === 'serving'
                  ? 'bg-emerald-500/10'
                  : currentTicket?.status === 'calling'
                  ? 'bg-indigo-500/15'
                  : 'bg-slate-800/30'
              }`}
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-5 sm:mb-6">
              <div className="min-w-0">
                <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Puesto de Atención Activo
                </span>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 mt-0.5 truncate">
                  <MonitorCheck className="w-5 h-5 text-indigo-400 shrink-0" />
                  <span className="truncate">{activeCounter?.name || 'Seleccione una ventanilla'}</span>
                </h2>
              </div>

              {/* Status Pill */}
              <div className="self-start sm:self-auto shrink-0">
                {currentTicket?.status === 'calling' && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-950 text-indigo-300 border border-indigo-500/40 animate-pulse flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5" />
                    Llamando a Ventanilla
                  </span>
                )}
                {currentTicket?.status === 'serving' && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    Atención en Curso
                  </span>
                )}
                {!currentTicket && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 inline-block">
                    Ventanilla Libre
                  </span>
                )}
              </div>
            </div>

            {/* Display Box */}
            <div className="py-4 sm:py-6 text-center">
              {currentTicket ? (
                <div className="space-y-3 sm:space-y-4">
                  <span className="inline-block text-xs font-bold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-lg">
                    {currentTicket.serviceName}
                  </span>

                  <div className="py-2 sm:py-4">
                    <span className="text-5xl sm:text-6xl md:text-8xl font-black font-mono tracking-tight text-white block break-all">
                      {currentTicket.ticketNumber}
                    </span>
                  </div>

                  {/* Timer / Timestamp info */}
                  {currentTicket.status === 'serving' ? (
                    <div className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 font-mono text-xs sm:text-sm font-semibold">
                      <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Tiempo de atención: {formatElapsed(elapsedSeconds)}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Llamado a las {formatTime(currentTicket.calledAt)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="py-8 sm:py-12 space-y-3">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl sm:rounded-3xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-500 mx-auto">
                    <Users className="w-7 h-7 sm:w-8 sm:h-8" />
                  </div>
                  <h3 className="text-sm sm:text-base font-semibold text-slate-300">
                    No hay turno activo en esta ventanilla
                  </h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Presione el botón &quot;Llamar Siguiente Turno&quot; para tomar el primer ticket de la fila.
                  </p>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="mt-4 sm:mt-6 pt-5 sm:pt-6 border-t border-slate-800">
              {!currentTicket ? (
                <button
                  onClick={handleCallNext}
                  disabled={waitingQueue.length === 0 || actionLoading}
                  className="w-full py-3.5 sm:py-4 px-4 sm:px-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-sm sm:text-base shadow-xl shadow-indigo-600/30 flex flex-wrap items-center justify-center gap-2 sm:gap-3 transition-all duration-200 transform hover:-translate-y-0.5 active:scale-98 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                >
                  {actionLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <PhoneCall className="w-5 h-5 shrink-0" />
                      <span>Llamar Siguiente Turno</span>
                      <span className="text-xs font-mono bg-white/20 px-2 py-0.5 rounded-lg">
                        {waitingQueue.length} en espera
                      </span>
                    </>
                  )}
                </button>
              ) : currentTicket.status === 'calling' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={handleRecall}
                      disabled={actionLoading}
                      className="py-3.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm border border-slate-700 flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Volume2 className="w-4 h-4 text-indigo-400 shrink-0" />
                      Re-llamar Turno
                    </button>

                    <button
                      onClick={handleStartServing}
                      disabled={actionLoading}
                      className="py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-white shrink-0" />
                      Iniciar Atención
                    </button>
                  </div>

                  <button
                    onClick={handleNoShow}
                    disabled={actionLoading}
                    className="w-full py-3 sm:py-2.5 px-4 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-medium text-xs border border-rose-500/30 flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <UserX className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>El cliente no se presentó (Ausente / Saltar)</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={handleComplete}
                    disabled={actionLoading}
                    className="w-full py-3.5 sm:py-4 px-5 sm:px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm sm:text-base shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2.5 transition cursor-pointer"
                  >
                    {actionLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5 shrink-0" />
                        Finalizar Atención del Turno
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Real-time Waiting Queue for this Counter (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl flex flex-col min-h-[320px] max-h-[480px] lg:h-[600px] lg:max-h-none">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3.5 sm:pb-4 mb-3.5 sm:mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-sm sm:text-base text-white">Cola de Espera</h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 font-mono text-xs font-bold border border-indigo-500/20">
              {waitingQueue.length} esperando
            </span>
          </div>

          {/* Queue items list */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {waitingQueue.length === 0 ? (
              <div className="h-full py-10 flex flex-col items-center justify-center text-center p-4 sm:p-6 text-slate-500">
                <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 text-slate-700 mb-2" />
                <p className="text-sm font-medium text-slate-400">Cola al día</p>
                <p className="text-xs text-slate-500 mt-1">
                  No hay clientes en espera para los servicios de esta ventanilla.
                </p>
              </div>
            ) : (
              waitingQueue.map((ticket, index) => {
                const isNext = index === 0;
                return (
                  <div
                    key={ticket.id}
                    className={`p-3 sm:p-3.5 rounded-2xl border transition flex items-center justify-between gap-2 ${
                      isNext
                        ? 'bg-indigo-950/40 border-indigo-500/40 shadow-md'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                          isNext
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {index + 1}
                      </div>

                      <div className="min-w-0">
                        <span className="font-mono font-bold text-sm sm:text-base text-white block">
                          {ticket.ticketNumber}
                        </span>
                        <p className="text-xs text-slate-400 truncate">{ticket.serviceName}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[11px] font-mono text-slate-400 block">
                        {formatTime(ticket.createdAt)}
                      </span>
                      {isNext && (
                        <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider block mt-0.5">
                          Siguiente &bull;
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
