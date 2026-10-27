'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getSystemSettings, updateSystemSettings } from '@/lib/firebase/firestore';
import { TicketPreview } from '@/components/admin/TicketPreview';
import { useBluetooth } from '@/context/BluetoothContext';
import type { SystemSettings } from '@/types';
import {
  Save,
  CheckCircle2,
  Printer,
  Loader2,
  AlertCircle,
  ImagePlus,
  Trash2,
  ShieldCheck,
  Sparkles,
  Contrast,
  Settings,
  ArrowRight,
  Type,
  FileText,
} from 'lucide-react';
import { PrinterStatusButton } from '@/components/bluetooth/PrinterStatusButton';

export default function TicketSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingLogo, setProcessingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { isConnected, testPrint } = useBluetooth();

  useEffect(() => {
    async function load() {
      try {
        const data = await getSystemSettings();
        const defaultCompanyTitle = data.companyName || 'GEVS Queue Pro';
        const hasCustomLines =
          data.titleLines &&
          data.titleLines.length > 0 &&
          !(
            data.titleLines.length === 1 &&
            data.titleLines[0]?.trim().toLowerCase() === 'gevs queue pro' &&
            data.companyName &&
            data.companyName.trim().toLowerCase() !== 'gevs queue pro'
          );

        const existingLines: string[] = (hasCustomLines && data.titleLines)
          ? data.titleLines
          : defaultCompanyTitle.split(/\r?\n/);
        const count = data.titleLinesCount || Math.max(1, existingLines.length);
        const normalizedLines = Array.from({ length: count }, (_, idx) => existingLines[idx] ?? '');

        const loadedSettings: SystemSettings = {
          ...data,
          titleLinesCount: count,
          titleLines: normalizedLines,
          showLogo: data.showLogo ?? Boolean(data.logoDataUrl || data.logoSourceDataUrl),
        };
        setSettings(loadedSettings);
      } catch (err: any) {
        setError('Error al cargar configuración del ticket: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleChange = (field: keyof SystemSettings, value: any) => {
    if (!settings) return;
    setSettings({
      ...settings,
      [field]: value,
    });
    setSaveSuccess(false);
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
      setSettings({
        ...settings,
        showLogo: true,
        logoDataUrl: dataUrl,
        logoSourceDataUrl: dataUrl,
      });
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

  const handleTitleLinesCountChange = (newCount: number) => {
    if (!settings) return;
    const currentLines = [...(settings.titleLines || [settings.companyName || ''])];
    const nonEmptyCurrent = currentLines.map((l) => l.trim()).filter(Boolean);
    let nextLines: string[] = [];

    if (
      newCount > 1 &&
      nonEmptyCurrent.length === 1 &&
      nonEmptyCurrent[0].includes(' ')
    ) {
      const words = nonEmptyCurrent[0].split(/\s+/);
      const chunkSize = Math.ceil(words.length / newCount);
      for (let i = 0; i < newCount; i++) {
        nextLines.push(words.slice(i * chunkSize, (i + 1) * chunkSize).join(' '));
      }
    } else if (newCount === 1 && nonEmptyCurrent.length > 1) {
      nextLines = [nonEmptyCurrent.join(' ')];
    } else {
      nextLines = Array.from({ length: newCount }, (_, idx) => currentLines[idx] ?? '');
    }

    setSettings({
      ...settings,
      titleLinesCount: newCount,
      titleLines: nextLines,
    });
    setSaveSuccess(false);
  };

  const handleTitleLineTextChange = (index: number, text: string) => {
    if (!settings) return;
    const count = settings.titleLinesCount || 1;
    const nextLines = Array.from(
      { length: count },
      (_, idx) => (idx === index ? text : settings.titleLines?.[idx] ?? '')
    );

    setSettings({
      ...settings,
      titleLines: nextLines,
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
        <span>Cargando diseño del ticket...</span>
      </div>
    );
  }

  if (!settings) return null;

  const titleLinesCount = settings.titleLinesCount || 1;
  const activeTitleLines = Array.from(
    { length: titleLinesCount },
    (_, idx) => settings.titleLines?.[idx] ?? (idx === 0 ? settings.companyName : '')
  );

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4 sm:pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Printer className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400 shrink-0" />
            <span>Diseño y Configuración del Ticket Térmico</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Personaliza el formato de impresión ESC/POS, líneas de título, logotipo 1-bit y textos del ticket físico.
          </p>
        </div>

        {/* Hardware Status & Quick Link to General Settings */}
        <div className="flex flex-wrap items-center gap-2">
          <PrinterStatusButton />

          {isConnected && (
            <button
              type="button"
              onClick={() => testPrint(settings)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir Prueba
            </button>
          )}

          <Link
            href="/admin/settings"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium transition"
          >
            <Settings className="w-3.5 h-3.5 text-indigo-400" />
            <span>Configuración General</span>
          </Link>
        </div>
      </div>

      {/* Main Grid: Form Left, Live Preview Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
        {/* Form Column */}
        <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-5 sm:space-y-6">
          {/* Ticket Title Lines Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3.5">
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
                  <Type className="w-4 h-4 text-indigo-400 shrink-0" />
                  Título Impreso en el Ticket
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Divide el título del ticket en varias líneas centradas para controlar cómo se imprime (ej. Línea 1: <strong>Peluquería</strong>, Línea 2: <strong>Latinos</strong>).
                </p>
              </div>

              <div className="inline-flex flex-wrap rounded-xl bg-slate-950 p-1 border border-slate-800 self-start sm:self-auto shrink-0">
                {[1, 2, 3, 4].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleTitleLinesCountChange(num)}
                    className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      titleLinesCount === num
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {num} {num === 1 ? 'línea' : 'líneas'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              {activeTitleLines.map((lineText, idx) => (
                <div key={idx}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-300">
                      {titleLinesCount === 1
                        ? 'Título del Ticket (Centrado) *'
                        : `Línea ${idx + 1} del Título (Centrada)${idx === 0 ? ' *' : ''}`}
                    </label>
                    <span className="text-[10px] font-mono text-slate-500">
                      {lineText.length} caract.
                    </span>
                  </div>
                  <input
                    type="text"
                    required={idx === 0}
                    value={lineText}
                    onChange={(e) => handleTitleLineTextChange(idx, e.target.value)}
                    placeholder={
                      idx === 0
                        ? 'ej. Peluquería'
                        : idx === 1
                        ? 'ej. Latinos'
                        : `Continuación línea ${idx + 1}`
                    }
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-bold text-center uppercase tracking-wide text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Logo Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <ImagePlus className="w-4 h-4 text-indigo-400 shrink-0" />
                  <h2 className="text-sm sm:text-base font-semibold text-white">
                    Logotipo del Ticket
                  </h2>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  La imagen subida se imprimirá directamente en el encabezado del ticket mediante WebBLEPrinter.
                </p>
              </div>

              <label className="inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                <input
                  type="checkbox"
                  checked={Boolean(settings.showLogo)}
                  onChange={(e) => handleChange('showLogo', e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-950"
                />
                <span className="text-xs font-semibold text-slate-200">Imprimir Logo en Ticket</span>
              </label>
            </div>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleLogoFileSelect}
              className="hidden"
            />

            {!settings.logoDataUrl && !settings.logoSourceDataUrl ? (
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
                  Subir imagen del logotipo
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Soporta PNG, JPG, SVG o WebP. Se utilizará directamente en la impresión.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Preview & Info Bar */}
                <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="bg-white p-3 rounded-xl border border-slate-300 flex items-center justify-center min-w-[140px] min-h-[72px] shrink-0">
                    <img
                      src={settings.logoDataUrl || settings.logoSourceDataUrl}
                      alt="Logo del Ticket"
                      className="max-h-20 max-w-[160px] object-contain"
                    />
                  </div>

                  <div className="flex-1 space-y-1.5 text-center sm:text-left min-w-0">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-500/30 text-xs text-emerald-300 font-medium">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        Imagen directa activa (WebBLEPrinter)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Impresión directa procesada con el canvas interno de la impresora.
                    </p>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={processingLogo}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
                      >
                        Cambiar Imagen
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Quitar Logo
                      </button>
                      {isConnected && (
                        <button
                          type="button"
                          onClick={() => testPrint(settings)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Probar Logo Ahora
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Ticket Texts & Paper Format Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
            <h2 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
              Textos, Papel y Elementos del Ticket
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Encabezado del Ticket
                </label>
                <input
                  type="text"
                  value={settings.ticketHeader}
                  onChange={(e) => handleChange('ticketHeader', e.target.value)}
                  placeholder="ej. BIENVENIDO A SU ATENCIÓN"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Mensaje de Pie de Página
                </label>
                <textarea
                  rows={2}
                  value={settings.ticketFooter}
                  onChange={(e) => handleChange('ticketFooter', e.target.value)}
                  placeholder="ej. Gracias por su visita, por favor conserve su ticket."
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Paper Width selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Ancho de Papel de la Impresora
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => handleChange('paperWidth', '58mm')}
                    className={`py-2.5 px-4 rounded-xl text-xs font-semibold border transition text-center cursor-pointer ${
                      settings.paperWidth === '58mm'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    58 mm (Estándar portátil)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChange('paperWidth', '80mm')}
                    className={`py-2.5 px-4 rounded-xl text-xs font-semibold border transition text-center cursor-pointer ${
                      settings.paperWidth === '80mm'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    80 mm (Punto de venta ancho)
                  </button>
                </div>
              </div>

              {/* Toggles */}
              <div className="pt-2 border-t border-slate-800 space-y-2 sm:space-y-3">
                <label className="flex items-center justify-between gap-3 cursor-pointer p-2.5 rounded-xl hover:bg-slate-800/40 transition">
                  <span className="text-xs text-slate-300">Mostrar nombre de la sucursal</span>
                  <input
                    type="checkbox"
                    checked={settings.showBranch}
                    onChange={(e) => handleChange('showBranch', e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-950 shrink-0"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 cursor-pointer p-2.5 rounded-xl hover:bg-slate-800/40 transition">
                  <span className="text-xs text-slate-300">Mostrar fecha y hora de emisión</span>
                  <input
                    type="checkbox"
                    checked={settings.showDateTime}
                    onChange={(e) => handleChange('showDateTime', e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-950 shrink-0"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 cursor-pointer p-2.5 rounded-xl hover:bg-slate-800/40 transition">
                  <span className="text-xs text-slate-300">
                    Mostrar personas en espera por delante
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.showQueueCount}
                    onChange={(e) => handleChange('showQueueCount', e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-950 shrink-0"
                  />
                </label>
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
                  Guardar Diseño del Ticket
                </>
              )}
            </button>

            {saveSuccess && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Diseño del ticket guardado correctamente</span>
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

        {/* Live Preview Sticky Column */}
        <div className="lg:col-span-5 lg:sticky lg:top-8">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col items-center">
            <TicketPreview settings={settings} />
            <p className="text-[11px] text-slate-500 text-center mt-4 max-w-xs">
              Esta simulación se actualiza en tiempo real reflejando el aspecto exacto que tendrá en papel térmico físico.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
