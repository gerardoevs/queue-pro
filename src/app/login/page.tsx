'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { checkIfUsersExist, seedInitialSystemData, type SeedResult } from '@/lib/firebase/seed';
import {
  Layers,
  Lock,
  Mail,
  ArrowRight,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Server,
  UserCheck,
} from 'lucide-react';

export default function LoginPage() {
  const { user, profile, login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Seed state
  const [checkingUsers, setCheckingUsers] = useState(true);
  const [hasUsers, setHasUsers] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);

  // If already logged in, redirect
  useEffect(() => {
    if (user && profile) {
      if (profile.role === 'admin') router.replace('/admin');
      else if (profile.role === 'agent') router.replace('/agent');
      else if (profile.role === 'kiosk') router.replace('/kiosk');
    }
  }, [user, profile, router]);

  // Check if system has users
  useEffect(() => {
    async function checkUsers() {
      try {
        const exists = await checkIfUsersExist();
        setHasUsers(exists);
      } catch (err) {
        console.error(err);
      } finally {
        setCheckingUsers(false);
      }
    }
    checkUsers();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Por favor ingrese su correo electrónico y contraseña.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const userProfile = await login(email.trim(), password);
      // Redirect based on role
      if (userProfile.role === 'admin') {
        router.push('/admin');
      } else if (userProfile.role === 'agent') {
        router.push('/agent');
      } else if (userProfile.role === 'kiosk') {
        router.push('/kiosk');
      } else {
        router.push('/admin');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/user-not-found'
      ) {
        setErrorMessage('Credenciales incorrectas. Verifique su correo y contraseña.');
      } else if (
        err.code === 'auth/the-service-is-currently-unavailable' ||
        err.message?.includes('the-service-is-currently-unavailable')
      ) {
        setErrorMessage(
          'El servicio de autenticación de Firebase no respondió a tiempo. Se intentó reconectar automáticamente. Por favor compruebe su conexión e inténtelo de nuevo en unos segundos.'
        );
      } else if (
        err.code === 'auth/network-request-failed' ||
        err.message?.includes('network-request-failed')
      ) {
        setErrorMessage('Fallo de conexión de red al contactar el servidor de autenticación. Verifique su acceso a internet.');
      } else if (err.code === 'auth/too-many-requests') {
        setErrorMessage('Demasiados intentos fallidos. Por seguridad, espere unos momentos antes de reintentar.');
      } else {
        setErrorMessage(err.message || 'Error al iniciar sesión. Inténtelo nuevamente.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    setErrorMessage(null);
    try {
      const result = await seedInitialSystemData();
      setSeedResult(result);
      if (result.success) {
        setHasUsers(true);
        // Pre-fill admin
        setEmail('admin@queuepro.com');
        setPassword('Admin123!');
      } else {
        setErrorMessage(result.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al ejecutar seed inicial.');
    } finally {
      setSeeding(false);
    }
  };

  const quickFill = (userEmail: string, pass: string) => {
    setEmail(userEmail);
    setPassword(pass);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background glowing gradients */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-emerald-600/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md z-10 flex flex-col gap-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 p-0.5 shadow-xl shadow-indigo-500/20 mb-3 flex items-center justify-center">
            <div className="w-full h-full bg-slate-950/80 rounded-[14px] flex items-center justify-center backdrop-blur-sm">
              <Layers className="w-7 h-7 text-indigo-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            GEVS Queue Pro
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gestión Inteligente de Turnos y Colas en Tiempo Real
          </p>
        </div>

        {/* Seed helper banner if database has no users */}
        {!checkingUsers && !hasUsers && !seedResult && (
          <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-4.5 backdrop-blur-md shadow-lg shadow-indigo-950/50">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-indigo-200">
                  Configuración Inicial del Sistema
                </h2>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  No se detectaron usuarios registrados. Puedes inicializar la base de datos con un clic para generar el Administrador, Sucursal Central, Servicios y usuarios demo.
                </p>
                <button
                  type="button"
                  onClick={handleSeed}
                  disabled={seeding}
                  className="mt-3.5 w-full flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50"
                >
                  {seeding ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Inicializando datos de prueba...
                    </>
                  ) : (
                    <>
                      <Server className="w-4 h-4" />
                      Inicializar Sistema Demo Ahora
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Seed success notice */}
        {seedResult?.success && (
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 backdrop-blur-md">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <h3 className="font-semibold text-emerald-300">¡Sistema Inicializado con Éxito!</h3>
                <p className="text-slate-300 mt-1">Hemos cargado las credenciales de prueba:</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => quickFill('admin@queuepro.com', 'Admin123!')}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-mono text-[11px] border border-emerald-500/30 transition flex items-center gap-1.5"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Admin: admin@queuepro.com
                  </button>
                  <button
                    type="button"
                    onClick={() => quickFill('agente@queuepro.com', 'Agente123!')}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 font-mono text-[11px] border border-blue-500/30 transition flex items-center gap-1.5"
                  >
                    Agente: agente@queuepro.com
                  </button>
                  <button
                    type="button"
                    onClick={() => quickFill('kiosko@queuepro.com', 'Kiosko123!')}
                    className="px-2.5 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 font-mono text-[11px] border border-purple-500/30 transition flex items-center gap-1.5"
                  >
                    Kiosko: kiosko@queuepro.com
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Login Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-7 shadow-2xl backdrop-blur-xl">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
                Correo Electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@empresa.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                <>
                  Ingresar al Sistema
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Credentials Footer if system is ready */}
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <p className="text-[11px] text-center text-slate-400 mb-2.5">
              Acceso Rápido de Prueba (Demo)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => quickFill('admin@queuepro.com', 'Admin123!')}
                className="py-1.5 px-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-[11px] text-slate-300 text-center border border-slate-700/50 transition font-medium"
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => quickFill('agente@queuepro.com', 'Agente123!')}
                className="py-1.5 px-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-[11px] text-slate-300 text-center border border-slate-700/50 transition font-medium"
              >
                Agente
              </button>
              <button
                type="button"
                onClick={() => quickFill('kiosko@queuepro.com', 'Kiosko123!')}
                className="py-1.5 px-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-[11px] text-slate-300 text-center border border-slate-700/50 transition font-medium"
              >
                Kiosko
              </button>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 text-center">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Acceso restringido para personal autorizado de la empresa.</span>
        </div>
      </div>
    </div>
  );
}
