'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getSystemSettings, updateSystemSettings } from '@/lib/firebase/firestore';
import { useTheme, applyThemeToDOM, type ThemeMode } from '@/context/ThemeContext';
import type { SystemSettings } from '@/types';
import {
  Settings,
  Save,
  CheckCircle2,
  Printer,
  Loader2,
  AlertCircle,
  ImagePlus,
  Trash2,
  Sparkles,
  Sun,
  Moon,
  Palette,
  Building2,
  Monitor,
} from 'lucide-react';

export default function GeneralSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingLogo, setProcessingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { theme, setTheme } = useTheme();

  useEffect(() => {
    async function load() {
      try {
        const data = await getSystemSettings();
        const savedLocal =
          typeof localStorage !== 'undefined'
            ? (localStorage.getItem('queue-pro-theme') as ThemeMode | null)
            : null;
        const resolvedTheme: ThemeMode =
          data.theme === 'light' || data.theme === 'dark'
            ? data.theme
            : savedLocal === 'light' || savedLocal === 'dark'
            ? savedLocal
            : 'dark';

        const loadedSettings: SystemSettings = {
          ...data,
          theme: resolvedTheme,
        };
        setSettings(loadedSettings);
        applyThemeToDOM(resolvedTheme);
        setTheme(resolvedTheme, false);
      } catch (err: any) {
        setError('Error al cargar configuración general: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [setTheme]);

  const handleChange = (field: keyof SystemSettings, value: any) => {
    if (!settings) return;
    const next: SystemSettings = {
      ...settings,
      [field]: value,
    };
    // If companyName changes and titleLines was single-line default, keep it synced
    if (
      field === 'companyName' &&
      (!settings.titleLinesCount || settings.titleLinesCount === 1)
    ) {
      next.titleLines = [value];
    }
    setSettings(next);
    setSaveSuccess(false);
  };

  const handleThemeSelect = async (newTheme: ThemeMode) => {
    if (!settings) return;
    applyThemeToDOM(newTheme);
    setSettings({
      ...settings,
      theme: newTheme,
    });
    await setTheme(newTheme, true);
  };

  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings) return;

    setProcessingLogo(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) {
        setProcessingLogo(false);
        return;
      }
      const updated: SystemSettings = {
        ...settings,
        showLogo: true,
        logoSourceDataUrl: dataUrl,
        logoDataUrl: dataUrl,
      };
      setSettings(updated);
      setSaveSuccess(false);
      setProcessingLogo(false);
    };
    reader.onerror = () => {
      setError('Error al leer el archivo de imagen.');
      setProcessingLogo(false);
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveLogo = () => {
    if (!settings) return;
    setSettings({
      ...settings,
      showLogo: false,
      logoDataUrl: '',
      logoSourceDataUrl: '',
      logoRasterBase64: '',
      logoWidth: 0,
      logoHeight: 0,
    });
    setSaveSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      await updateSystemSettings(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mr-3" />
        <span>Cargando configuración general...</span>
      </div>
    );
  }

  if (!settings) return null;

  const displayLogo = settings.logoSourceDataUrl || settings.logoDataUrl;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4 sm:pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Settings className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400 shrink-0" />
            <span>Configuración General del Sistema</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Personaliza el tema visual (Modo Oscuro / Claro), nombre del negocio, datos corporativos y logotipo para el Kiosko.
          </p>
        </div>

        {/* Quick Link to Ticket Design */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/ticket"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold transition"
          >
            <Printer className="w-4 h-4 text-indigo-400" />
            <span>Ir a Diseño del Ticket</span>
          </Link>
        </div>
      </div>

      {/* Main Grid: Form Left, Kiosk Welcome Preview Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
        {/* Form Column */}
        <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-5 sm:space-y-6">
          {/* 1. Theme / Appearance Card (Dark Mode & Light Mode) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-indigo-400 shrink-0" />
                  <h2 className="text-sm sm:text-base font-semibold text-white">
                    Apariencia y Tema del Sistema
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-500/30">
                    Sincronización Global
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Elige entre Modo Oscuro (Dark Mode) o Modo Claro (Light Mode). Se aplica al instante en todo el sistema.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Dark Mode Option */}
              <button
                type="button"
                onClick={() => handleThemeSelect('dark')}
                className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                  (settings.theme || theme) === 'dark'
                    ? 'bg-indigo-950/40 border-indigo-500 shadow-md shadow-indigo-500/10'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition ${
                    (settings.theme || theme) === 'dark'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Moon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-bold text-white">
                      Modo Oscuro (Dark)
                    </span>
                    {(settings.theme || theme) === 'dark' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-600 text-white">
                        Activo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    Interfaz oscura de alto contraste, ideal para operación continua y menor fatiga visual.
                  </p>
                </div>
              </button>

              {/* Light Mode Option */}
              <button
                type="button"
                onClick={() => handleThemeSelect('light')}
                className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                  (settings.theme || theme) === 'light'
                    ? 'bg-indigo-950/40 border-indigo-500 shadow-md shadow-indigo-500/10'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition ${
                    (settings.theme || theme) === 'light'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Sun className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-bold text-white">
                      Modo Claro (Light)
                    </span>
                    {(settings.theme || theme) === 'light' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-600 text-white">
                        Activo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    Interfaz clara y luminosa con fondos blancos, ideal para oficinas y ambientes muy iluminados.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* 2. Business Logo Card (Displayed on Kiosk & System) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <ImagePlus className="w-4 h-4 text-indigo-400 shrink-0" />
                  <h2 className="text-sm sm:text-base font-semibold text-white">
                    Logotipo del Negocio
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                    Visible en Kiosko
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Al subir el logotipo aquí, se mostrará automáticamente en la pantalla del Kiosko arriba del mensaje de bienvenida y quedará listo para el ticket.
                </p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleLogoFileSelect}
              className="hidden"
            />

            {!displayLogo ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-indigo-500/60 bg-slate-950/50 hover:bg-slate-950 rounded-2xl p-6 text-center cursor-pointer transition group"
              >
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto mb-3 group-hover:scale-105 transition">
                  {processingLogo ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <ImagePlus className="w-6 h-6" />
                  )}
                </div>
                <p className="text-xs sm:text-sm font-semibold text-slate-200">
                  Haz clic para subir el logotipo de tu negocio
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Soporta PNG, JPG, SVG o WebP. Se mostrará arriba del título en el Kiosko de turnos.
                </p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="bg-white p-3 rounded-xl border border-slate-300 flex items-center justify-center min-w-[140px] min-h-[80px] shrink-0 shadow-sm">
                  <img
                    src={displayLogo}
                    alt="Logotipo del negocio"
                    className="max-h-16 max-w-[160px] object-contain"
                  />
                </div>

                <div className="flex-1 space-y-2 text-center sm:text-left min-w-0">
                  <div className="text-xs font-bold text-white">
                    Logotipo corporativo activo
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Este logotipo se muestra arriba del título de bienvenida en el Kiosko táctil. También puedes ajustar su versión 1-bit en{' '}
                    <Link href="/admin/ticket" className="text-indigo-400 hover:underline font-medium">
                      Diseño del Ticket
                    </Link>.
                  </p>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={processingLogo}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
                    >
                      Cambiar Logotipo
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Quitar Logotipo
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. Business Information Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
            <h2 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3.5">
              <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
              Datos Generales del Negocio
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Nombre Comercial del Negocio / Empresa *
                </label>
                <input
                  type="text"
                  required
                  value={settings.companyName}
                  onChange={(e) => handleChange('companyName', e.target.value)}
                  placeholder="ej. GEVS Queue Pro"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-semibold text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Eslogan / Subtítulo Corporativo
                </label>
                <input
                  type="text"
                  value={settings.slogan || ''}
                  onChange={(e) => handleChange('slogan', e.target.value)}
                  placeholder="ej. Atención de Calidad Siempre"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Identificación Fiscal / NIT
                </label>
                <input
                  type="text"
                  value={settings.taxId || ''}
                  onChange={(e) => handleChange('taxId', e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Teléfono de Contacto
                </label>
                <input
                  type="text"
                  value={settings.phone || ''}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto justify-center px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/25 flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando cambios...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Guardar Configuración General
                </>
              )}
            </button>

            {saveSuccess && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Configuración general guardada correctamente</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-1.5 text-xs text-rose-400 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </form>

        {/* Live Kiosk Header & Welcome Preview Column */}
        <div className="lg:col-span-5 lg:sticky lg:top-8">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Monitor className="w-4 h-4 text-indigo-400" />
                <span>Vista Previa de Bienvenida en Kiosko</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-950/60 text-indigo-300 border border-indigo-500/30">
                {(settings.theme || theme) === 'light' ? 'Modo Claro' : 'Modo Oscuro'}
              </span>
            </div>

            {/* Simulated Kiosk Welcome Screen */}
            <div className="rounded-2xl bg-slate-950 border border-slate-800 p-6 text-center space-y-3 shadow-inner">
              {displayLogo && (
                <div className="flex justify-center mb-2">
                  <div className="bg-white p-3 rounded-2xl shadow-md border border-slate-200/80 inline-flex items-center justify-center">
                    <img
                      src={displayLogo}
                      alt={settings.companyName}
                      className="max-h-16 max-w-[180px] object-contain"
                    />
                  </div>
                </div>
              )}

              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-semibold uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  {settings.companyName || 'GEVS Queue Pro'}
                </span>
              </div>

              <h3 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
                ¿En qué podemos ayudarle hoy?
              </h3>

              {settings.slogan && (
                <p className="text-xs text-slate-400 font-medium">
                  {settings.slogan}
                </p>
              )}

              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                Por favor toque la opción de su preferencia en la pantalla para imprimir su turno.
              </p>
            </div>

            <p className="text-[11px] text-slate-500 text-center">
              Así verán tus clientes la cabecera de bienvenida en el Kiosko táctil.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
