'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (profile) {
      if (profile.role === 'admin') {
        router.replace('/admin');
      } else if (profile.role === 'agent') {
        router.replace('/agent');
      } else if (profile.role === 'kiosk') {
        router.replace('/kiosk');
      } else {
        router.replace('/login');
      }
    } else {
      router.replace('/login');
    }
  }, [user, profile, loading, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
        <p className="text-sm text-slate-400">Cargando GEVS Queue Pro...</p>
      </div>
    </div>
  );
}
