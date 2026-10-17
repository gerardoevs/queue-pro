import React from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { AdminSidebar } from '@/components/admin/Sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-row">
      <AdminSidebar />
      <main className="flex-1 min-w-0 overflow-y-auto h-screen bg-slate-950">
        <div className="p-8 max-w-7xl mx-auto">
          <AuthGuard allowedRoles={['admin']}>
            {children}
          </AuthGuard>
        </div>
      </main>
    </div>
  );
}
