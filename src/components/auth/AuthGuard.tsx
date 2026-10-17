'use client';

import React, { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@/types';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  const isAuthorized = Boolean(
    !loading && user && (!allowedRoles || (profile && allowedRoles.includes(profile.role)))
  );

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (profile && allowedRoles && !allowedRoles.includes(profile.role)) {
      // Redirect to user's assigned module
      if (profile.role === 'admin') router.replace('/admin');
      else if (profile.role === 'agent') router.replace('/agent');
      else if (profile.role === 'kiosk') router.replace('/kiosk');
      else router.replace('/login');
    }
  }, [user, profile, loading, allowedRoles, router]);

  if (!isAuthorized) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 shadow-xl shadow-indigo-500/10 animate-pulse">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-tight text-slate-100">GEVS Queue Pro</h2>
            <p className="text-sm text-slate-400">Verificando credenciales y permisos...</p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
