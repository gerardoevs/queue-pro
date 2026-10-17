'use client';

import React, { useState, useEffect } from 'react';
import { getSystemSettings, updateSystemSettings } from '@/lib/firebase/firestore';
import { TicketPreview } from '@/components/admin/TicketPreview';
import { useBluetooth } from '@/context/BluetoothContext';
import type { SystemSettings } from '@/types';
import {
  Settings,
  Save,
  CheckCircle2,
  Printer,
  Bluetooth,
  Loader2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { PrinterStatusButton } from '@/components/bluetooth/PrinterStatusButton';

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isConnected, isConnecting, connect, disconnect, testPrint, deviceName } =
    useBluetooth();

  useEffect(() => {
    async function load() {
      try {
        const data = await getSystemSettings();
        const existingLines =
          data.titleLines && data.titleLines.length > 0
            ? data.titleLines
            : (data.companyName || 'GEVS Queue Pro').split(/\r?\n/);
        const count = data.titleLinesCount || Math.max(1, existingLines.length);
        const normalizedLines = Array.from({ length: count }, (_, idx) => existingLines[idx] ?? '');
        setSettings({
          ...data,
          titleLinesCount: count,
          titleLines: normalizedLines,
        });
      } catch (err: any) {
        setError('Error al cargar configuración: ' + err.message);
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

  const handleTitleLinesCountChange = (newCount: number) => {
    if (!settings) return;
    const currentLines = [...(settings.titleLines || [settings.companyName || ''])];

    // If increasing from 1 line to multiple lines and extra lines are empty, split words automatically
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

    const joinedCompanyName =
      nextLines.map((l) => l.trim()).filter(Boolean).join(' ') || settings.companyName;

    setSettings({
      ...settings,
      titleLinesCount: newCount,
      titleLines: nextLines,
      companyName: joinedCompanyName,
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
    const joinedCompanyName =
      nextLines.map((l) => l.trim()).filter(Boolean).join(' ') || text;

    setSettings({
      ...settings,
      titleLines: nextLines,
      companyName: joinedCompanyName,
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
        <span>Cargando configuración...</span>
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
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-indigo-400" />
            Configuración de Empresa & Ticket
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Personaliza los datos corporativos, diseño de tickets térmicos y prueba de hardware Bluetooth.
          </p>
        </div>

        {/* Hardware Status Header Pill */}
        <div className="flex items-center gap-2">
          <PrinterStatusButton />

          {isConnected && (
            <button
              type="button"
              onClick={testPrint}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir Prueba
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Form Left, Preview Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Form Column */}
        <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-6">
          {/* Company Data Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              Datos de la Empresa y Título del Ticket
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Selector for Number of Lines in Ticket Title */}
              <div className="sm:col-span-2 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <label className="block text-xs font-medium text-slate-300">
                    Cantidad de líneas del título en el ticket
                  </label>
                  <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                    {[1, 2, 3, 4].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleTitleLinesCountChange(num)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
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
                <p className="text-[11px] text-slate-400">
                  Divide el nombre comercial en varias líneas centradas para controlar cómo se imprime en el ticket (ej. Línea 1: <strong className="text-slate-200">Peluquería</strong>, Línea 2: <strong className="text-slate-200">Latinos</strong>).
                </p>
              </div>

              {/* Per-line inputs */}
              <div className="sm:col-span-2 space-y-2.5">
                {activeTitleLines.map((lineText, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-slate-300">
                        {titleLinesCount === 1
                          ? 'Nombre Comercial / Título del Ticket *'
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

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Eslogan / Subtítulo
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

          {/* Ticket Printing Configuration Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              Configuración del Ticket Térmico
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
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleChange('paperWidth', '58mm')}
                    className={`py-2.5 px-4 rounded-xl text-xs font-semibold border transition text-center ${
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
                    className={`py-2.5 px-4 rounded-xl text-xs font-semibold border transition text-center ${
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
              <div className="pt-2 border-t border-slate-800 space-y-3">
                <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-xl hover:bg-slate-800/40 transition">
                  <span className="text-xs text-slate-300">Mostrar nombre de la sucursal</span>
                  <input
                    type="checkbox"
                    checked={settings.showBranch}
                    onChange={(e) => handleChange('showBranch', e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-950"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-xl hover:bg-slate-800/40 transition">
                  <span className="text-xs text-slate-300">Mostrar fecha y hora de emisión</span>
                  <input
                    type="checkbox"
                    checked={settings.showDateTime}
                    onChange={(e) => handleChange('showDateTime', e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-950"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-xl hover:bg-slate-800/40 transition">
                  <span className="text-xs text-slate-300">
                    Mostrar personas en espera por delante
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.showQueueCount}
                    onChange={(e) => handleChange('showQueueCount', e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-950"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/25 flex items-center gap-2 transition disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando cambios...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Guardar Configuración
                </>
              )}
            </button>

            {saveSuccess && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>Configuración guardada correctamente</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-1.5 text-xs text-rose-400 font-medium">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </form>

        {/* Live Preview Sticky Column */}
        <div className="lg:col-span-5 sticky top-8">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col items-center">
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
