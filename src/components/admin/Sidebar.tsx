'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  Building2,
  Tag,
  MonitorCheck,
  Users,
  Settings,
  LogOut,
  Layers,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/branches', label: 'Sucursales', icon: Building2 },
  { href: '/admin/services', label: 'Servicios', icon: Tag },
  { href: '/admin/counters', label: 'Ventanillas', icon: MonitorCheck },
  { href: '/admin/users', label: 'Gestión de Usuarios', icon: Users },
  { href: '/admin/settings', label: 'Configuración & Ticket', icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { profile, logout } = useAuth();

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 h-screen sticky top-0">
      {/* Brand */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <Link href="/admin" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30 group-hover:scale-105 transition">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight text-white leading-tight">
              GEVS Queue Pro
            </h1>
            <span className="text-[11px] font-medium text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
              Panel Admin
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3.5 space-y-1.5 overflow-y-auto">
        <div className="px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          Módulos Administrativos
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group',
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className={cn('w-4 h-4', isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200')} />
                <span>{item.label}</span>
              </div>
              {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/70" />}
            </Link>
          );
        })}

        {/* Direct access to kiosk and agent view for testing */}
        <div className="pt-4 px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          Acceso Rápido Operativo
        </div>
        <Link
          href="/kiosk"
          target="_blank"
          className="flex items-center justify-between px-3.5 py-2 rounded-xl text-xs text-slate-400 hover:text-indigo-300 hover:bg-indigo-950/30 transition border border-transparent hover:border-indigo-500/20"
        >
          <div className="flex items-center gap-3">
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir Kiosko</span>
          </div>
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">Pestaña</span>
        </Link>
        <Link
          href="/agent"
          target="_blank"
          className="flex items-center justify-between px-3.5 py-2 rounded-xl text-xs text-slate-400 hover:text-indigo-300 hover:bg-indigo-950/30 transition border border-transparent hover:border-indigo-500/20"
        >
          <div className="flex items-center gap-3">
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir Consola Agente</span>
          </div>
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">Pestaña</span>
        </Link>
      </nav>

      {/* User Footer Profile & Logout */}
      <div className="p-3.5 border-t border-slate-800 bg-slate-900/60">
        <div className="flex items-center justify-between gap-3 p-2 rounded-xl bg-slate-800/50 border border-slate-800">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-200 truncate">
              {profile?.name || 'Administrador'}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              {profile?.email || 'admin@queuepro.com'}
            </p>
          </div>
          <button
            onClick={() => logout()}
            title="Cerrar Sesión"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
