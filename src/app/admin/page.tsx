'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getTodayDateString, formatTime } from '@/lib/utils';
import type { Ticket, Branch, Service } from '@/types';
import {
  LayoutDashboard,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Tag,
  ArrowUpRight,
  TrendingUp,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const [todayDateString, setTodayDateString] = useState<string>('');

  useEffect(() => {
    setTodayDateString(getTodayDateString());
  }, []);

  // Listen to branches & services
  useEffect(() => {
    const unsubBranches = onSnapshot(
      collection(db, 'branches'),
      (snap) => {
        const list: Branch[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setBranches(list);
      },
      (err) => {
        if (err.code !== 'permission-denied') console.error('Error listening to branches:', err);
      }
    );

    const unsubServices = onSnapshot(
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

    return () => {
      unsubBranches();
      unsubServices();
    };
  }, []);

  // Listen to tickets of today
  useEffect(() => {
    if (!todayDateString) return;

    const q = query(
      collection(db, 'tickets'),
      where('dateString', '==', todayDateString)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Ticket[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        // Sort descending by createdAt
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setTickets(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to today tickets:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [todayDateString]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    if (selectedBranchId === 'all') return tickets;
    return tickets.filter((t) => t.branchId === selectedBranchId);
  }, [tickets, selectedBranchId]);

  // Computed Metrics
  const metrics = useMemo(() => {
    const total = filteredTickets.length;
    const waiting = filteredTickets.filter((t) => t.status === 'waiting').length;
    const inProgress = filteredTickets.filter(
      (t) => t.status === 'calling' || t.status === 'serving'
    ).length;
    const completed = filteredTickets.filter((t) => t.status === 'completed').length;
    const skipped = filteredTickets.filter((t) => t.status === 'skipped').length;

    // Calculate average attention time for completed tickets
    let totalDurationMs = 0;
    let countWithDuration = 0;

    filteredTickets.forEach((t) => {
      if (t.status === 'completed' && t.startedAt && t.completedAt) {
        const diff = t.completedAt - t.startedAt;
        if (diff > 0) {
          totalDurationMs += diff;
          countWithDuration++;
        }
      }
    });

    const avgMinutes =
      countWithDuration > 0
        ? Math.round(totalDurationMs / countWithDuration / 60000)
        : 0;

    return {
      total,
      waiting,
      inProgress,
      completed,
      skipped,
      avgMinutes,
    };
  }, [filteredTickets]);

  // Service distribution
  const serviceStats = useMemo(() => {
    const map: Record<string, { name: string; prefix: string; count: number }> = {};
    filteredTickets.forEach((t) => {
      if (!map[t.serviceId]) {
        map[t.serviceId] = {
          name: t.serviceName,
          prefix: t.servicePrefix,
          count: 0,
        };
      }
      map[t.serviceId].count++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [filteredTickets]);

  const getStatusBadge = (status: Ticket['status']) => {
    switch (status) {
      case 'waiting':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/50 text-amber-300 border border-amber-500/30">
            En Espera
          </span>
        );
      case 'calling':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-950/50 text-indigo-300 border border-indigo-500/30 animate-pulse">
            Llamando
          </span>
        );
      case 'serving':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-950/50 text-blue-300 border border-blue-500/30">
            En Atención
          </span>
        );
      case 'completed':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/50 text-emerald-300 border border-emerald-500/30">
            Completado
          </span>
        );
      case 'skipped':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/50 text-rose-300 border border-rose-500/30">
            Ausente
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <LayoutDashboard className="w-6 h-6 text-indigo-400" />
              Panel de Control en Tiempo Real
            </h1>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              En Vivo
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Métricas operativas del día{todayDateString ? ` (${todayDateString})` : ''}
          </p>
        </div>

        {/* Branch Filter Selector */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Building2 className="w-4 h-4 text-slate-400" />
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todas las Sucursales</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Waiting */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-amber-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              En Espera
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {metrics.waiting}
            </span>
            <span className="text-xs text-amber-400">turnos</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">Clientes aguardando en sala</div>
        </div>

        {/* In Progress */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-indigo-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              En Atención
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {metrics.inProgress}
            </span>
            <span className="text-xs text-indigo-400">en ventanilla</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">Llamando o siendo atendidos</div>
        </div>

        {/* Completed */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-emerald-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Atendidos Hoy
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {metrics.completed}
            </span>
            <span className="text-xs text-emerald-400">concluidos</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">Total completados exitosamente</div>
        </div>

        {/* Average Attention Time */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group hover:border-blue-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Promedio Atención
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {metrics.avgMinutes}
            </span>
            <span className="text-xs text-blue-400">minutos</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">Tiempo medio por ventanilla</div>
        </div>
      </div>

      {/* Services breakdown and Recent Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Service Distribution (4 cols) */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Tag className="w-4 h-4 text-indigo-400" />
              Distribución por Servicio
            </h2>
            <span className="text-xs text-slate-400 font-mono">
              Total: {metrics.total}
            </span>
          </div>

          {serviceStats.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">
              Aún no se han generado turnos hoy.
            </p>
          ) : (
            <div className="space-y-3 pt-2">
              {serviceStats.map((stat) => {
                const percentage =
                  metrics.total > 0 ? Math.round((stat.count / metrics.total) * 100) : 0;
                return (
                  <div key={stat.prefix} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-200 flex items-center gap-1.5">
                        <span className="font-mono text-indigo-400 font-bold">[{stat.prefix}]</span>
                        {stat.name}
                      </span>
                      <span className="font-semibold text-slate-300 font-mono">
                        {stat.count} ({percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Real-time Tickets Activity Stream (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Turnos Recientes del Día
            </h2>
            <span className="text-xs text-slate-400">
              Mostrando {Math.min(filteredTickets.length, 15)} de {filteredTickets.length}
            </span>
          </div>

          {filteredTickets.length === 0 ? (
            <div className="text-center py-10">
              <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-400">
                No hay actividad de turnos registrada hoy para la sucursal seleccionada.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Turno</th>
                    <th className="py-2.5 px-3">Servicio</th>
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-3">Ventanilla / Agente</th>
                    <th className="py-2.5 px-3 text-right">Hora Emisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredTickets.slice(0, 15).map((t) => (
                    <tr key={t.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-bold text-sm text-indigo-300">
                          {t.ticketNumber}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">{t.serviceName}</td>
                      <td className="py-2.5 px-3">{getStatusBadge(t.status)}</td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {t.counterName ? (
                          <span className="text-slate-200 font-medium">
                            {t.counterName}
                            {t.agentName && <span className="text-slate-500"> ({t.agentName})</span>}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Sin asignar</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                        {formatTime(t.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
