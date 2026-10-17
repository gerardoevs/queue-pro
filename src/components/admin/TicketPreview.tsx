'use client';

import React from 'react';
import type { SystemSettings } from '@/types';
import { Printer } from 'lucide-react';

interface TicketPreviewProps {
  settings: SystemSettings;
  branchName?: string;
}

export function TicketPreview({ settings, branchName = 'Sucursal Central' }: TicketPreviewProps) {
  const is58mm = settings.paperWidth === '58mm';
  const widthClass = is58mm ? 'max-w-[280px]' : 'max-w-[360px]';

  const rawLines =
    settings.titleLines && settings.titleLines.length > 0
      ? settings.titleLines.slice(0, settings.titleLinesCount || settings.titleLines.length)
      : (settings.companyName || 'GEVS QUEUE PRO').split(/\r?\n/);

  const displayTitleLines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (displayTitleLines.length === 0) {
    displayTitleLines.push('GEVS QUEUE PRO');
  }

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-3 font-medium">
        <Printer className="w-4 h-4 text-indigo-400" />
        <span>Vista Previa del Ticket Térmico ({settings.paperWidth})</span>
      </div>

      {/* Simulated thermal ticket paper */}
      <div
        className={`${widthClass} w-full bg-amber-50/95 text-slate-900 rounded-sm shadow-2xl p-5 font-mono text-xs select-none transition-all duration-300 relative border-t-8 border-slate-300/60`}
        style={{
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Paper top edge cut teeth pattern */}
        <div className="absolute -top-2 left-0 right-0 h-2 bg-repeat-x bg-[radial-gradient(circle,transparent_50%,#fffbeb_50%)] bg-[length:10px_10px]" />

        {/* Company Header */}
        <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-400/80">
          <div className="font-bold text-sm tracking-tight text-slate-950 uppercase leading-tight space-y-0.5">
            {displayTitleLines.map((line, idx) => (
              <div key={idx} className="text-center break-words">
                {line}
              </div>
            ))}
          </div>
          {settings.slogan && (
            <p className="text-[11px] text-slate-700 leading-tight">
              {settings.slogan}
            </p>
          )}
          {settings.showBranch && (
            <p className="text-[11px] font-semibold text-slate-800">
              Sucursal: {branchName}
            </p>
          )}
        </div>

        {/* Ticket Header & Service */}
        <div className="text-center py-2.5 space-y-1">
          {settings.ticketHeader && (
            <p className="font-bold text-[11px] text-slate-800 uppercase tracking-wide">
              {settings.ticketHeader}
            </p>
          )}
          <p className="text-[11px] text-slate-700">
            Servicio: <span className="font-semibold">Atención al Cliente</span>
          </p>
        </div>

        {/* Turn Number (Huge Font) */}
        <div className="my-2 py-3 bg-slate-900/5 border-y-2 border-dashed border-slate-400 text-center">
          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-600 block mb-0.5">
            Su Turno
          </span>
          <span className="text-4xl font-extrabold tracking-tight text-slate-950 block">
            ATC-001
          </span>
        </div>

        {/* Queue count & Date / Time */}
        <div className="text-center space-y-1 py-2 text-[11px] text-slate-700">
          {settings.showQueueCount && (
            <p className="font-medium text-slate-800">
              Personas antes de usted: <span className="font-bold">2</span>
            </p>
          )}

          {settings.showDateTime && (
            <p className="text-[10px] text-slate-600">
              Fecha: {new Date().toLocaleDateString()} | Hora: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        {/* Footer */}
        {settings.ticketFooter && (
          <div className="mt-3 pt-2.5 border-t border-dashed border-slate-400/80 text-center">
            <p className="text-[10px] text-slate-600 leading-relaxed italic">
              {settings.ticketFooter}
            </p>
          </div>
        )}

        {/* Barcode simulation */}
        <div className="mt-4 pt-2 border-t border-slate-300 flex flex-col items-center">
          <div className="h-7 w-3/4 flex items-center justify-between gap-[2px] opacity-80">
            {Array.from({ length: 36 }).map((_, i) => (
              <div
                key={i}
                className="h-full bg-slate-800"
                style={{
                  width: i % 3 === 0 ? '3px' : i % 2 === 0 ? '1px' : '2px',
                }}
              />
            ))}
          </div>
          <span className="text-[9px] text-slate-500 font-mono tracking-widest mt-1">
            *ATC001-20261015*
          </span>
        </div>

        {/* Paper bottom cut teeth */}
        <div className="absolute -bottom-2 left-0 right-0 h-2 bg-repeat-x bg-[radial-gradient(circle,transparent_50%,#fffbeb_50%)] bg-[length:10px_10px] rotate-180" />
      </div>
    </div>
  );
}
