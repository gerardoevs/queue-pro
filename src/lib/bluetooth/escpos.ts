import type { SystemSettings, Ticket } from '@/types';
import { formatDate, formatTime } from '../utils';

export class EscPosEncoder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  // ESC @: Initialize printer
  init(): this {
    this.buffer.push(0x1b, 0x40);
    return this;
  }

  // ESC a n: Align (0: Left, 1: Center, 2: Right)
  align(alignment: 'left' | 'center' | 'right'): this {
    const val = alignment === 'center' ? 1 : alignment === 'right' ? 2 : 0;
    this.buffer.push(0x1b, 0x61, val);
    return this;
  }

  // ESC E n: Bold font (1: on, 0: off)
  bold(enable: boolean): this {
    this.buffer.push(0x1b, 0x45, enable ? 1 : 0);
    return this;
  }

  // GS ! n: Font size
  // 0x00: Normal
  // 0x11: 2x (double width + double height)
  // 0x22: 3x
  // 0x33: 4x
  size(size: 'normal' | 'large' | 'huge'): this {
    let byte = 0x00;
    if (size === 'large') byte = 0x11;
    if (size === 'huge') byte = 0x33;
    this.buffer.push(0x1d, 0x21, byte);
    return this;
  }

  // Text encoder with fallback for accents / ñ
  text(str: string): this {
    const cleanStr = str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents for clean thermal printing
      .replace(/[^\x20-\x7E\n\r]/g, ''); // ASCII printable only

    for (let i = 0; i < cleanStr.length; i++) {
      this.buffer.push(cleanStr.charCodeAt(i));
    }
    return this;
  }

  // Line feed
  line(str: string = ''): this {
    if (str) {
      this.text(str);
    }
    this.buffer.push(0x0a);
    return this;
  }

  // Multiple line feeds
  feed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(0x0a);
    }
    return this;
  }

  // Horizontal dashed or solid separator line
  separator(width: '58mm' | '80mm' = '58mm', char: string = '-'): this {
    const maxChars = width === '80mm' ? 46 : 31;
    return this.line(char.repeat(maxChars));
  }

  // Feed paper so the ticket text clears the manual tear bar.
  // Only send hardware guillotine cut command (GS V) if explicitly enabled (e.g. 80mm printers with auto-cutter).
  // 58mm portable printers (like NETUM NT-1809) do NOT have an auto-cutter; sending GS V crashes or freezes their firmware.
  cut(hardwareCut: boolean = false): this {
    this.feed(4);
    if (hardwareCut) {
      // GS V 1: Partial cut
      this.buffer.push(0x1d, 0x56, 0x01);
    }
    return this;
  }

  // Return generated Uint8Array
  getBuffer(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Builds the ESC/POS receipt for a ticket based on system settings
 */
export function buildTicketEscPos(
  ticket: Ticket,
  settings: SystemSettings,
  branchName?: string,
  peopleAhead: number = 0
): Uint8Array {
  const encoder = new EscPosEncoder();
  const width = settings.paperWidth || '58mm';

  // 1. Header & Company (Multi-line centered title)
  encoder.align('center');
  encoder.bold(true);
  encoder.size('large');

  const rawTitleLines =
    settings.titleLines && settings.titleLines.length > 0
      ? settings.titleLines.slice(0, settings.titleLinesCount || settings.titleLines.length)
      : (settings.companyName || 'GEVS QUEUE PRO').split(/\r?\n/);

  const titleLinesToPrint = rawTitleLines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (titleLinesToPrint.length === 0) {
    encoder.line('GEVS QUEUE PRO');
  } else {
    for (const titleLine of titleLinesToPrint) {
      encoder.align('center');
      encoder.line(titleLine.toUpperCase());
    }
  }

  if (settings.slogan) {
    encoder.size('normal');
    encoder.bold(false);
    for (const sloganLine of settings.slogan.split(/\r?\n/)) {
      if (sloganLine.trim()) {
        encoder.align('center');
        encoder.line(sloganLine.trim());
      }
    }
  }

  if (settings.showBranch && branchName) {
    encoder.size('normal');
    encoder.bold(true);
    encoder.line(`Sucursal: ${branchName}`);
  }

  encoder.separator(width, '=');

  // 2. Ticket Header
  if (settings.ticketHeader) {
    encoder.size('normal');
    encoder.bold(true);
    for (const headerLine of settings.ticketHeader.split(/\r?\n/)) {
      if (headerLine.trim()) {
        encoder.align('center');
        encoder.line(headerLine.trim());
      }
    }
  }

  // 3. Service Name
  encoder.size('normal');
  encoder.bold(false);
  encoder.line(`Servicio: ${ticket.serviceName}`);

  encoder.separator(width, '-');

  // 4. Ticket Number in HUGE font
  encoder.feed(1);
  encoder.size('huge');
  encoder.bold(true);
  encoder.line(ticket.ticketNumber);
  encoder.feed(1);

  // 5. Queue status / people ahead
  encoder.size('normal');
  encoder.bold(false);
  if (settings.showQueueCount) {
    encoder.line(`Personas antes de usted: ${peopleAhead}`);
  }

  // 6. Date & Time
  if (settings.showDateTime) {
    const formattedDate = formatDate(ticket.createdAt);
    const formattedTime = formatTime(ticket.createdAt);
    encoder.line(`Fecha: ${formattedDate}  Hora: ${formattedTime}`);
  }

  encoder.separator(width, '-');

  // 7. Footer Message
  if (settings.ticketFooter) {
    encoder.size('normal');
    encoder.bold(false);
    encoder.line(settings.ticketFooter);
  }

  // 8. Cut paper or feed for manual tear
  // Only trigger hardware cut command on 80mm printers with auto-cutter; 58mm (e.g. NETUM NT-1809) uses manual tear
  const hasHardwareCutter = settings.paperWidth === '80mm';
  encoder.cut(hasHardwareCutter);

  // Reset printer modes (ESC @) to ensure subsequent print starts cleanly
  encoder.init();

  return encoder.getBuffer();
}
