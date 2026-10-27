import type { SystemSettings, Ticket } from '@/types';
import { formatDate, formatTime } from '../utils';
import { decodeRasterBase64 } from './logo';

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

  /**
   * GS v 0: Print raster bit image in a SINGLE continuous command.
   * - Avoiding multi-band splitting prevents the NETUM NT-1809 stepper motor from
   *   stopping and restarting every 16 rows ("impresión por partes").
   * - In 'fast' mode (m = 0x03, 2x hardware width & height scaling), payload size
   *   is reduced by 75% (~300-450 bytes total), printing in one fast sweep.
   * - Many 58mm portable printers (including NETUM NT-1809) ignore `ESC a 1` (center)
   *   for `GS v 0` raster graphics and print flush-left at dot 0. To guarantee
   *   exact centering on ALL printers, we switch to `ESC a 0` (left align) and
   *   bit-shift/pad each row on the left to the exact center of the thermal head
   *   (384 dots for 58mm, 576 dots for 80mm).
   */
  rasterLogo(
    rasterBytes: Uint8Array,
    width: number,
    height: number,
    scaleMode?: 'fast' | 'hd',
    paperWidth: '58mm' | '80mm' = '58mm'
  ): this {
    if (!rasterBytes || rasterBytes.length === 0 || width <= 0 || height <= 0) {
      return this;
    }
    const bytesPerRow = Math.floor(width / 8);
    if (bytesPerRow <= 0 || rasterBytes.length < bytesPerRow * height) {
      return this;
    }

    // Use m = 0x03 (2x width + 2x height in printer hardware) when in 'fast' mode
    // and width*2 fits within the thermal head (width <= 120).
    const useHardware2x =
      (scaleMode === 'fast' || (!scaleMode && width <= 112)) && width <= 120;
    const modeByte = useHardware2x ? 0x03 : 0x00;

    // 1. Find the actual horizontal bounding box of black pixels in rasterBytes
    //    so even previously saved logos with asymmetric margins are centered to the dot.
    let minX = width;
    let maxX = -1;
    for (let y = 0; y < height; y++) {
      const rowOffset = y * bytesPerRow;
      for (let b = 0; b < bytesPerRow; b++) {
        const byteVal = rasterBytes[rowOffset + b];
        if (byteVal !== 0) {
          for (let bit = 0; bit < 8; bit++) {
            if ((byteVal & (1 << (7 - bit))) !== 0) {
              const x = b * 8 + bit;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
            }
          }
        }
      }
    }

    if (maxX < minX) {
      minX = 0;
      maxX = width - 1;
    }

    const activeWidth = maxX - minX + 1;

    // 2. Compute printable line width in command dots:
    //    - 58mm head = 384 physical dots (192 command dots at 2x width m=0x03)
    //    - 80mm head = 576 physical dots (288 command dots at 2x width m=0x03)
    const physicalHeadDots = paperWidth === '80mm' ? 576 : 384;
    const lineDots = useHardware2x ? Math.floor(physicalHeadDots / 2) : physicalHeadDots;

    // Target starting dot on the paper roll so the active graphic is dead-center
    const targetStartDot = Math.max(0, Math.floor((lineDots - activeWidth) / 2));
    const totalOutDots = targetStartDot + activeWidth;
    const outBytesPerRow = Math.ceil(totalOutDots / 8);

    // Force left alignment (ESC a 0) before GS v 0 so the left dot padding is
    // deterministic on every printer (never ignored and never double-shifted).
    this.align('left');

    const xL = outBytesPerRow & 0xff;
    const xH = (outBytesPerRow >> 8) & 0xff;
    const yL = height & 0xff;
    const yH = (height >> 8) & 0xff;

    // Single uninterrupted GS v 0 m xL xH yL yH command
    this.buffer.push(0x1d, 0x76, 0x30, modeByte, xL, xH, yL, yH);

    const maxSafeSolidBytes = Math.max(4, Math.floor(bytesPerRow * 0.45));
    const outRow = new Uint8Array(outBytesPerRow);

    for (let y = 0; y < height; y++) {
      outRow.fill(0);
      const rowOffset = y * bytesPerRow;

      // Copy active pixels [minX..maxX] into [targetStartDot..targetStartDot + activeWidth - 1]
      for (let x = minX; x <= maxX; x++) {
        const srcByte = rasterBytes[rowOffset + (x >> 3)];
        const isBlack = (srcByte & (1 << (7 - (x & 7)))) !== 0;
        if (isBlack) {
          const dstX = targetStartDot + (x - minX);
          outRow[dstX >> 3] |= 1 << (7 - (dstX & 7));
        }
      }

      let solidBytesCount = 0;
      for (let b = 0; b < outBytesPerRow; b++) {
        let byteVal = outRow[b];
        // Hardware safety guard: if a row has too many solid 0xFF bytes,
        // apply a 50% checkerboard mask to protect the thermal head from stalling
        if (byteVal === 0xff) {
          solidBytesCount++;
          if (solidBytesCount > maxSafeSolidBytes) {
            byteVal &= y % 2 === 0 ? 0xaa : 0x55;
          }
        }
        this.buffer.push(byteVal);
      }
    }

    this.align('center');
    this.feed(1);
    return this;
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

  // 0. Thermal Logo (if enabled and configured)
  if (
    settings.showLogo &&
    settings.logoRasterBase64 &&
    settings.logoWidth &&
    settings.logoHeight
  ) {
    const rasterBytes = decodeRasterBase64(settings.logoRasterBase64);
    if (rasterBytes.length > 0) {
      encoder.rasterLogo(
        rasterBytes,
        settings.logoWidth,
        settings.logoHeight,
        settings.logoScaleMode,
        width
      );
    }
  }

  // 1. Header & Company (Multi-line centered title)
  encoder.align('center');
  encoder.bold(true);
  encoder.size('large');

  const defaultTitle = settings.companyName || 'GEVS QUEUE PRO';
  const hasCustomTitleLines =
    settings.titleLines &&
    settings.titleLines.length > 0 &&
    !(
      settings.titleLines.length === 1 &&
      settings.titleLines[0]?.trim().toLowerCase() === 'gevs queue pro' &&
      settings.companyName &&
      settings.companyName.trim().toLowerCase() !== 'gevs queue pro'
    );

  const rawTitleLines = hasCustomTitleLines
    ? settings.titleLines!.slice(0, settings.titleLinesCount || settings.titleLines!.length)
    : defaultTitle.split(/\r?\n/);

  const titleLinesToPrint = rawTitleLines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (titleLinesToPrint.length === 0) {
    encoder.line(defaultTitle.toUpperCase());
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

/**
 * Builds a test print buffer including the thermal logo if configured in settings
 */
export function buildTestPrintEscPos(settings?: SystemSettings | null): Uint8Array {
  const encoder = new EscPosEncoder();
  const width = settings?.paperWidth || '58mm';

  if (
    settings?.showLogo &&
    settings.logoRasterBase64 &&
    settings.logoWidth &&
    settings.logoHeight
  ) {
    const rasterBytes = decodeRasterBase64(settings.logoRasterBase64);
    if (rasterBytes.length > 0) {
      encoder.rasterLogo(
        rasterBytes,
        settings.logoWidth,
        settings.logoHeight,
        settings.logoScaleMode,
        width
      );
    }
  }

  encoder
    .align('center')
    .bold(true)
    .size('large')
    .line((settings?.companyName || 'GEVS QUEUE PRO').toUpperCase())
    .size('normal')
    .bold(false)
    .line('PRUEBA DE IMPRESION TERMICA')
    .line('NETUM NT-1809 / ESC-POS OK')
    .separator(width, '=')
    .line(new Date().toLocaleString())
    .cut(width === '80mm')
    .init();

  return encoder.getBuffer();
}

