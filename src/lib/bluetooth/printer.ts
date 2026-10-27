/* =====================================================================
   LIBRERÍA: WebBLEPrinter
   Descripción: Clase para controlar impresoras térmicas ESC/POS vía Bluetooth Web.
   Requisitos: Un elemento <canvas id="printerInternalCanvas"> en el DOM para procesar imágenes.
   ===================================================================== */

import type { SystemSettings, Ticket } from '@/types';
import { formatDate, formatTime } from '../utils';

const SERIAL_DEVICE_NAME = 'Impresora Térmica (Puerto COM / USB)';

const LS = {
  mode: 'gevs_printer_mode',
  autoConnect: 'gevs_printer_auto_connect',
  deviceName: 'gevs_printer_device_name',
  deviceId: 'gevs_printer_device_id',
  serviceUuid: 'gevs_printer_service_uuid',
  serialInfo: 'gevs_printer_serial_info',
  serialBaud: 'gevs_printer_serial_baud',
} as const;

function lsGet(key: string): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
}

function lsSet(key: string, value: string): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
}

export interface PrinterState {
  isConnected: boolean;
  deviceName?: string;
  connectionType?: 'bluetooth' | 'serial' | null;
  isReconnecting: boolean;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  error?: string | null;
}

export interface PrinterCapabilities {
  webBluetooth: boolean;
  persistentBluetoothPermissions: boolean;
  watchAdvertisements: boolean;
  webSerial: boolean;
}

export class WebBLEPrinter {
  public device: any = null;
  public characteristic: any = null;
  // UUIDs comunes para impresoras POS
  public serviceUUIDs: string[] = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    '0000ae30-0000-1000-8000-00805f9b34fb',
    '0000ae00-0000-1000-8000-00805f9b34fb',
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000ff02-0000-1000-8000-00805f9b34fb',
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000fff0-0000-1000-8000-00805f9b34fb',
    '0000fee7-0000-1000-8000-00805f9b34fb',
    '000018f1-0000-1000-8000-00805f9b34fb',
    '00001101-0000-1000-8000-00805f9b34fb',
  ];

  // Comandos ESC/POS estándar
  public CMD = {
    INIT: [0x1b, 0x40],
    ALIGN_LEFT: [0x1b, 0x61, 0x00],
    ALIGN_CENTER: [0x1b, 0x61, 0x01],
    ALIGN_RIGHT: [0x1b, 0x61, 0x02],
    BOLD_ON: [0x1b, 0x45, 0x01],
    BOLD_OFF: [0x1b, 0x45, 0x00],
    SIZE_NORMAL: [0x1d, 0x21, 0x00],
    SIZE_LARGE: [0x1d, 0x21, 0x11],
    SIZE_HUGE: [0x1d, 0x21, 0x33],
    NEWLINE: [0x0a],
    FEED: [0x1b, 0x64], // Requiere un byte extra con el número de líneas
    CUT: [0x1d, 0x56, 0x41, 0x10],
  };

  private server: any = null;
  private serialPort: any = null;
  private connectionType: 'bluetooth' | 'serial' | null = null;
  private shouldAutoReconnect: boolean = true;
  private isReconnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 10;
  private reconnectTimer: any = null;
  private lastError: string | null = null;
  private onStateChangeListeners: Array<(state: PrinterState) => void> = [];
  private printLock: Promise<void> = Promise.resolve();
  private autoConnectPromise: Promise<boolean> | null = null;
  private serialListenersAttached: boolean = false;

  constructor() {
    this.handleDisconnection = this.handleDisconnection.bind(this);
    this.handleSerialConnect = this.handleSerialConnect.bind(this);
    this.handleSerialDisconnect = this.handleSerialDisconnect.bind(this);
    this.releaseForUnload = this.releaseForUnload.bind(this);

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.releaseForUnload);
      window.addEventListener('pageshow', (event: PageTransitionEvent) => {
        if (event.persisted) this.autoConnectKnownDevice().catch(() => { });
      });
    }
  }

  public static isSupported(): boolean {
    return typeof window !== 'undefined' && 'bluetooth' in navigator;
  }

  public static isSerialSupported(): boolean {
    return typeof window !== 'undefined' && 'serial' in navigator;
  }

  public static getCapabilities(): PrinterCapabilities {
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    const bt = nav?.bluetooth;
    const BluetoothDeviceCtor =
      typeof window !== 'undefined' ? (window as any).BluetoothDevice : undefined;
    return {
      webBluetooth: Boolean(bt),
      persistentBluetoothPermissions: typeof bt?.getDevices === 'function',
      watchAdvertisements: typeof BluetoothDeviceCtor?.prototype?.watchAdvertisements === 'function',
      webSerial: Boolean(nav?.serial),
    };
  }

  public onStateChange(listener: (state: PrinterState) => void): () => void {
    this.onStateChangeListeners.push(listener);
    return () => {
      this.onStateChangeListeners = this.onStateChangeListeners.filter((l) => l !== listener);
    };
  }

  private notifyState(
    connected: boolean,
    deviceName?: string,
    isReconnecting: boolean = false,
    reconnectAttempts: number = 0,
    error: string | null = null
  ): void {
    this.lastError = error;
    const state: PrinterState = {
      isConnected: connected,
      deviceName: deviceName ?? this.getDeviceName(),
      connectionType: this.connectionType,
      isReconnecting,
      reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      error,
    };
    this.onStateChangeListeners.forEach((listener) => listener(state));
  }

  public getState(): PrinterState {
    return {
      isConnected: this.isConnected(),
      deviceName: this.getDeviceName(),
      connectionType: this.connectionType,
      isReconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      error: this.lastError,
    };
  }

  public isConnected(): boolean {
    if (this.connectionType === 'serial') {
      return Boolean(this.serialPort && this.serialPort.writable);
    }
    return Boolean(this.device && this.device.gatt?.connected && this.characteristic);
  }

  public getConnectionType(): 'bluetooth' | 'serial' | null {
    return this.connectionType;
  }

  public isAutoReconnecting(): boolean {
    return this.isReconnecting;
  }

  public getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  public getMaxReconnectAttempts(): number {
    return this.maxReconnectAttempts;
  }

  public getDeviceName(): string | undefined {
    if (this.connectionType === 'serial') {
      return SERIAL_DEVICE_NAME;
    }
    return this.device?.name || undefined;
  }

  /**
   * Solicita conexión Bluetooth al usuario y establece el canal de comunicación.
   * Implementación exacta de WebBLEPrinter.connect()
   */
  public async connect(): Promise<boolean> {
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    if (!nav?.bluetooth) {
      throw new Error('Web Bluetooth API no está soportada en este navegador.');
    }

    try {
      this.stopReconnectLoop();
      this.reconnectAttempts = 0;
      this.shouldAutoReconnect = true;

      this.device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: this.serviceUUIDs,
      });

      if (!this.device) {
        return false;
      }

      if (this.serialPort) {
        await this.serialPort.close().catch(() => { });
        this.serialPort = null;
      }

      this.device.removeEventListener('gattserverdisconnected', this.handleDisconnection);
      this.device.addEventListener('gattserverdisconnected', this.handleDisconnection);

      const server = await this.device.gatt.connect();
      this.server = server;
      let targetService: any = null;

      for (const uuid of this.serviceUUIDs) {
        try {
          targetService = await server.getPrimaryService(uuid);
          if (targetService) {
            lsSet(LS.serviceUuid, uuid);
            break;
          }
        } catch (e) { }
      }

      if (!targetService) {
        const services = await server.getPrimaryServices();
        if (services.length > 0) targetService = services[0];
        else throw new Error('No se encontraron servicios Bluetooth en el dispositivo.');
      }

      const characteristics = await targetService.getCharacteristics();
      this.characteristic = characteristics.find(
        (c: any) => c.properties.write || c.properties.writeWithoutResponse
      );

      if (!this.characteristic) {
        throw new Error('El dispositivo no permite escritura (no es una impresora válida).');
      }

      this.connectionType = 'bluetooth';
      lsSet(LS.mode, 'bluetooth');
      lsSet(LS.autoConnect, 'true');
      if (this.device.name) lsSet(LS.deviceName, this.device.name);
      if (this.device.id) lsSet(LS.deviceId, this.device.id);

      // Asegurar que la impresora inicie limpia
      await this.write(this.CMD.INIT);
      this.notifyState(true, this.device.name || 'Impresora Térmica', false, 0, null);
      return true;
    } catch (error: any) {
      if (error?.name === 'NotFoundError') {
        this.notifyState(this.isConnected(), this.getDeviceName(), false, 0, null);
        return false;
      }
      this.teardown();
      this.notifyState(false, undefined, false, 0, error?.message ?? null);
      throw error;
    }
  }

  /**
   * Desconecta el dispositivo
   */
  public disconnect(): void {
    this.shouldAutoReconnect = false;
    this.reconnectAttempts = 0;
    lsSet(LS.autoConnect, 'false');

    if (this.device && this.device.gatt?.connected) {
      try {
        this.device.removeEventListener('gattserverdisconnected', this.handleDisconnection);
        this.device.gatt.disconnect();
      } catch { }
    }
    if (this.serialPort) {
      try {
        this.serialPort.close().catch(() => { });
      } catch { }
      this.serialPort = null;
    }

    this.stopReconnectLoop();
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.connectionType = null;
    this.notifyState(false, undefined, false, 0, null);
  }

  /**
   * Escribe datos crudos a la impresora en trozos (chunks)
   * @param {Array<number>|Uint8Array} dataArray Arreglo de bytes
   */
  public async write(dataArray: number[] | Uint8Array): Promise<void> {
    if (this.connectionType === 'serial' && this.serialPort?.writable) {
      const data = dataArray instanceof Uint8Array ? dataArray : new Uint8Array(dataArray);
      const writer = this.serialPort.writable.getWriter();
      try {
        const CHUNK_SIZE = 100;
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
          const chunk = data.slice(i, i + CHUNK_SIZE);
          await writer.write(chunk);
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      } finally {
        writer.releaseLock();
      }
      return;
    }

    if (!this.characteristic) throw new Error('No hay impresora conectada.');

    const data = dataArray instanceof Uint8Array ? dataArray : new Uint8Array(dataArray);
    const CHUNK_SIZE = 100; // MTU seguro para BLE

    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      await this.characteristic.writeValue(chunk);
      await new Promise((resolve) => setTimeout(resolve, 20)); // Evitar overflow
    }
  }

  /**
   * Convierte texto a bytes y lo imprime
   */
  public async printText(text: string): Promise<void> {
    const encoder = new TextEncoder();
    // Normaliza para evitar caracteres que crasheen la impresora térmica básica
    const cleanText = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const bytes = Array.from(encoder.encode(cleanText));
    await this.write(bytes);
  }

  /**
   * Cambia la alineación: 'left', 'center', 'right'
   */
  public async setAlign(align: 'left' | 'center' | 'right'): Promise<void> {
    if (align === 'center') await this.write(this.CMD.ALIGN_CENTER);
    else if (align === 'right') await this.write(this.CMD.ALIGN_RIGHT);
    else await this.write(this.CMD.ALIGN_LEFT);
  }

  /**
   * Activa o desactiva la negrita
   */
  public async setBold(enable: boolean): Promise<void> {
    await this.write(enable ? this.CMD.BOLD_ON : this.CMD.BOLD_OFF);
  }

  /**
   * Cambia el tamaño de fuente: 'normal', 'large', 'huge'
   */
  public async setSize(size: 'normal' | 'large' | 'huge'): Promise<void> {
    if (size === 'large') await this.write(this.CMD.SIZE_LARGE);
    else if (size === 'huge') await this.write(this.CMD.SIZE_HUGE);
    else await this.write(this.CMD.SIZE_NORMAL);
  }

  /**
   * Avanza N líneas de papel
   */
  public async feed(lines: number = 1): Promise<void> {
    await this.write([...this.CMD.FEED, lines]);
  }

  /**
   * Realiza un salto de línea
   */
  public async newline(): Promise<void> {
    await this.write(this.CMD.NEWLINE);
  }

  /**
   * Imprime una imagen HTML (<img>) procesándola a monocromo usando <canvas id="printerInternalCanvas">.
   */
  public async printImage(imgElement: HTMLImageElement, targetWidth?: number): Promise<void> {
    let canvas = document.getElementById('printerInternalCanvas') as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'printerInternalCanvas';
      canvas.style.display = 'none';
      document.body.appendChild(canvas);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo obtener el contexto 2D de printerInternalCanvas.');

    const MAX_WIDTH = 384; // Estándar para 58mm

    let width = targetWidth || imgElement.naturalWidth || imgElement.width;
    let height = imgElement.naturalHeight || imgElement.height;

    if (targetWidth && imgElement.naturalWidth > 0) {
      height = Math.round(imgElement.naturalHeight * (targetWidth / imgElement.naturalWidth));
    }

    if (width > MAX_WIDTH) {
      height = Math.floor((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }
    width = Math.floor(width / 8) * 8; // Múltiplo de 8
    if (width <= 0 || height <= 0) return;

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(imgElement, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height).data;
    const rasterData: number[] = [];
    let currentByte = 0;
    let bitPos = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const alpha = imageData[idx + 3] / 255;
        const r = imageData[idx] * alpha + 255 * (1 - alpha);
        const g = imageData[idx + 1] * alpha + 255 * (1 - alpha);
        const b = imageData[idx + 2] * alpha + 255 * (1 - alpha);
        const brightness = (r + g + b) / 3;

        if (brightness < 128) currentByte |= 1 << (7 - bitPos); // Pixel negro

        bitPos++;
        if (bitPos === 8) {
          rasterData.push(currentByte);
          currentByte = 0;
          bitPos = 0;
        }
      }
    }

    const m = 0;
    const xL = (width / 8) % 256;
    const xH = Math.floor(width / 8 / 256);
    const yL = height % 256;
    const yH = Math.floor(height / 256);

    const header = [0x1d, 0x76, 0x30, m, xL, xH, yL, yH];
    await this.write([...header, ...rasterData]);
  }

  /**
   * Auxiliar para cargar un dataURL/URL en un <img> e imprimirlo con printImage()
   */
  public async printImageFromUrl(src: string, targetWidth?: number): Promise<void> {
    if (!src || typeof document === 'undefined') return;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo cargar la imagen para imprimir.'));
      el.src = src;
    });
    if (targetWidth && targetWidth > 0 && img.naturalWidth > 0) {
      const ratio = img.naturalHeight / img.naturalWidth;
      img.width = targetWidth;
      img.height = Math.max(1, Math.round(targetWidth * ratio));
    }
    await this.printImage(img, targetWidth);
  }

  /**
   * Imprime un Ticket completo utilizando secuencialmente los métodos de WebBLEPrinter
   */
  public async printTicketWithLibrary(
    ticket: Ticket,
    settings: SystemSettings,
    branchName?: string,
    peopleAhead: number = 0
  ): Promise<void> {
    const run = async () => {
      if (!this.isConnected()) {
        const reconnected = await this.reconnect();
        if (!reconnected || !this.isConnected()) {
          throw new Error('No hay impresora conectada.');
        }
      }

      const paperWidth = settings.paperWidth || '58mm';
      const sepCount = paperWidth === '80mm' ? 46 : 31;

      await this.write(this.CMD.INIT);

      // 0. Logo con printImage() + <canvas id="printerInternalCanvas">
      const logoSrc = settings.logoDataUrl || settings.logoSourceDataUrl;
      if (settings.showLogo && logoSrc) {
        await this.setAlign('center');
        await this.printImageFromUrl(logoSrc, 128);
        await this.newline();
      }

      // 1. Encabezado / Nombre de la empresa
      await this.setAlign('center');
      await this.setBold(true);
      await this.setSize('large');

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
        await this.printText(defaultTitle.toUpperCase());
        await this.newline();
      } else {
        for (const titleLine of titleLinesToPrint) {
          await this.setAlign('center');
          await this.printText(titleLine.toUpperCase());
          await this.newline();
        }
      }

      await this.setSize('normal');
      await this.setBold(false);

      if (settings.slogan) {
        for (const sloganLine of settings.slogan.split(/\r?\n/)) {
          if (sloganLine.trim()) {
            await this.setAlign('center');
            await this.printText(sloganLine.trim());
            await this.newline();
          }
        }
      }

      if (settings.showBranch && branchName) {
        await this.setBold(true);
        await this.printText(`Sucursal: ${branchName}`);
        await this.newline();
        await this.setBold(false);
      }

      await this.printText('='.repeat(sepCount));
      await this.newline();

      // 2. Sub-encabezado del Ticket
      if (settings.ticketHeader) {
        await this.setBold(true);
        for (const headerLine of settings.ticketHeader.split(/\r?\n/)) {
          if (headerLine.trim()) {
            await this.setAlign('center');
            await this.printText(headerLine.trim());
            await this.newline();
          }
        }
        await this.setBold(false);
      }

      // 3. Servicio
      await this.setAlign('center');
      await this.printText(`Servicio: ${ticket.serviceName}`);
      await this.newline();
      await this.printText('-'.repeat(sepCount));
      await this.newline();

      // 4. Número de Turno en tamaño grande/gigante
      await this.newline();
      await this.setSize('huge');
      await this.setBold(true);
      await this.printText(ticket.ticketNumber);
      await this.newline();
      await this.setSize('normal');
      await this.setBold(false);
      await this.newline();

      // 5. Personas adelante
      if (settings.showQueueCount) {
        await this.printText(`Personas antes de usted: ${peopleAhead}`);
        await this.newline();
      }

      // 6. Fecha y Hora
      if (settings.showDateTime) {
        const formattedDate = formatDate(ticket.createdAt);
        const formattedTime = formatTime(ticket.createdAt);
        await this.printText(`Fecha: ${formattedDate}  Hora: ${formattedTime}`);
        await this.newline();
      }

      await this.printText('-'.repeat(sepCount));
      await this.newline();

      // 7. Pie de página
      if (settings.ticketFooter) {
        await this.printText(settings.ticketFooter);
        await this.newline();
      }

      // 8. Avance de papel y corte
      await this.feed(4);
      if (paperWidth === '80mm') {
        await this.write(this.CMD.CUT);
      }
      await this.write(this.CMD.INIT);
    };

    const currentLock = this.printLock;
    let releaseLock: () => void = () => { };
    this.printLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    try {
      await currentLock;
      await run();
    } finally {
      releaseLock();
    }
  }

  /**
   * Imprime una página de prueba utilizando secuencialmente los métodos de WebBLEPrinter
   */
  public async printTestWithLibrary(settings?: SystemSettings | null): Promise<void> {
    const run = async () => {
      if (!this.isConnected()) {
        const reconnected = await this.reconnect();
        if (!reconnected || !this.isConnected()) {
          throw new Error('No hay impresora conectada.');
        }
      }

      const paperWidth = settings?.paperWidth || '58mm';
      const sepCount = paperWidth === '80mm' ? 46 : 31;

      await this.write(this.CMD.INIT);

      const logoSrc = settings?.logoDataUrl || settings?.logoSourceDataUrl;
      if (settings?.showLogo && logoSrc) {
        await this.setAlign('center');
        await this.printImageFromUrl(logoSrc);
        await this.newline();
      }

      await this.setAlign('center');
      await this.setBold(true);
      await this.setSize('large');
      await this.printText((settings?.companyName || 'GEVS QUEUE PRO').toUpperCase());
      await this.newline();

      await this.setSize('normal');
      await this.setBold(false);
      await this.printText('PRUEBA DE IMPRESION TERMICA');
      await this.newline();
      await this.printText('WebBLEPrinter ESC/POS OK');
      await this.newline();
      await this.printText('='.repeat(sepCount));
      await this.newline();
      await this.printText(new Date().toLocaleString());
      await this.newline();
      await this.feed(4);

      if (paperWidth === '80mm') {
        await this.write(this.CMD.CUT);
      }
      await this.write(this.CMD.INIT);
    };

    const currentLock = this.printLock;
    let releaseLock: () => void = () => { };
    this.printLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    try {
      await currentLock;
      await run();
    } finally {
      releaseLock();
    }
  }

  // Compatibilidad con llamadas directas print(buffer)
  public async print(buffer: Uint8Array): Promise<void> {
    const currentLock = this.printLock;
    let releaseLock: () => void = () => { };
    this.printLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    try {
      await currentLock;
      if (!this.isConnected()) {
        const reconnected = await this.reconnect();
        if (!reconnected || !this.isConnected()) {
          throw new Error('No hay impresora conectada.');
        }
      }
      await this.write(buffer);
    } finally {
      releaseLock();
    }
  }

  // ---------------------------------------------------------------------------
  // Reconexión automática y soporte complementario
  // ---------------------------------------------------------------------------

  private stopReconnectLoop(): void {
    this.isReconnecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private teardown(): void {
    this.stopReconnectLoop();
    if (this.serialPort) {
      try {
        this.serialPort.close().catch(() => { });
      } catch { }
      this.serialPort = null;
    }
    if (this.device) {
      try {
        this.device.removeEventListener('gattserverdisconnected', this.handleDisconnection);
      } catch { }
      if (this.device.gatt?.connected) {
        try {
          this.device.gatt.disconnect();
        } catch { }
      }
    }
    this.server = null;
    this.characteristic = null;
  }

  private releaseForUnload(): void {
    this.stopReconnectLoop();
    try {
      this.serialPort?.close?.().catch(() => { });
    } catch { }
    try {
      if (this.device) {
        this.device.removeEventListener('gattserverdisconnected', this.handleDisconnection);
        if (this.device.gatt?.connected) this.device.gatt.disconnect();
      }
    } catch { }
  }

  public async connectSerial(): Promise<boolean> {
    if (!WebBLEPrinter.isSerialSupported()) {
      throw new Error(
        'Web Serial no es compatible con este navegador. Por favor usa Google Chrome o Microsoft Edge.'
      );
    }

    try {
      const nav = navigator as any;
      const port = await nav.serial.requestPort();
      if (!port) return false;

      this.stopReconnectLoop();
      if (this.serialPort && this.serialPort !== port) {
        await this.serialPort.close().catch(() => { });
      }
      if (this.device) {
        try {
          this.device.removeEventListener('gattserverdisconnected', this.handleDisconnection);
          if (this.device.gatt?.connected) this.device.gatt.disconnect();
        } catch { }
      }
      this.server = null;
      this.characteristic = null;

      await this.openSerialPort(port);

      this.serialPort = port;
      this.connectionType = 'serial';
      this.shouldAutoReconnect = true;
      this.reconnectAttempts = 0;
      lsSet(LS.mode, 'serial');
      lsSet(LS.autoConnect, 'true');
      lsSet(LS.deviceName, SERIAL_DEVICE_NAME);
      this.saveSerialPortInfo(port);
      this.attachSerialListeners();

      await this.write(this.CMD.INIT);
      this.notifyState(true, SERIAL_DEVICE_NAME, false, 0, null);
      return true;
    } catch (error: any) {
      if (error?.name === 'NotFoundError') {
        return false;
      }
      this.teardown();
      this.notifyState(false, undefined, false, 0, error?.message ?? null);
      throw error;
    }
  }

  private async openSerialPort(port: any): Promise<void> {
    if (port.writable) return;
    const savedBaud = Number(lsGet(LS.serialBaud)) || 9600;
    const bauds = Array.from(new Set([savedBaud, 9600, 115200]));
    let lastErr: any = null;

    for (const baudRate of bauds) {
      try {
        await port.open({ baudRate });
        lsSet(LS.serialBaud, String(baudRate));
        return;
      } catch (err: any) {
        if (err?.name === 'InvalidStateError' && port.writable) return;
        lastErr = err;
      }
    }
    throw lastErr ?? new Error('No se pudo abrir el puerto serie.');
  }

  private saveSerialPortInfo(port: any): void {
    try {
      const info = typeof port.getInfo === 'function' ? port.getInfo() : {};
      lsSet(LS.serialInfo, JSON.stringify(info || {}));
    } catch { }
  }

  private async findSavedSerialPort(): Promise<any | null> {
    const nav = navigator as any;
    if (typeof nav.serial?.getPorts !== 'function') return null;
    const ports: any[] = await nav.serial.getPorts();
    if (!ports || ports.length === 0) return null;

    let saved: Record<string, unknown> | null = null;
    try {
      saved = JSON.parse(lsGet(LS.serialInfo) || 'null');
    } catch { }

    if (saved && Object.keys(saved).length > 0) {
      const match = ports.find((p) => {
        const info = typeof p.getInfo === 'function' ? p.getInfo() : {};
        return Object.entries(saved!).every(([k, v]) => info?.[k] === v);
      });
      if (match) return match;
    }
    return ports[0];
  }

  private attachSerialListeners(): void {
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    if (this.serialListenersAttached || typeof nav?.serial?.addEventListener !== 'function') return;
    nav.serial.addEventListener('connect', this.handleSerialConnect);
    nav.serial.addEventListener('disconnect', this.handleSerialDisconnect);
    this.serialListenersAttached = true;
  }

  private handleSerialConnect(): void {
    if (this.isConnected() || lsGet(LS.autoConnect) === 'false') return;
    this.autoConnectKnownDevice().catch(() => { });
  }

  private handleSerialDisconnect(event: any): void {
    if (this.connectionType !== 'serial') return;
    if (event?.target && this.serialPort && event.target !== this.serialPort) return;
    this.serialPort = null;
    this.notifyState(false, SERIAL_DEVICE_NAME, this.shouldAutoReconnect, this.reconnectAttempts);
    if (this.shouldAutoReconnect) this.scheduleReconnect();
  }

  public async autoConnectKnownDevice(): Promise<boolean> {
    if (this.isConnected()) return true;
    if (this.autoConnectPromise) return this.autoConnectPromise;

    this.autoConnectPromise = this.runAutoConnect().finally(() => {
      this.autoConnectPromise = null;
    });
    return this.autoConnectPromise;
  }

  private async runAutoConnect(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    if (lsGet(LS.autoConnect) === 'false') return false;

    const savedMode = lsGet(LS.mode) as 'bluetooth' | 'serial' | null;
    this.attachSerialListeners();

    await new Promise((resolve) => setTimeout(resolve, 600));

    const order: Array<'bluetooth' | 'serial'> =
      savedMode === 'bluetooth' ? ['bluetooth', 'serial'] : ['serial', 'bluetooth'];

    for (const mode of order) {
      const ok =
        mode === 'serial'
          ? await this.tryAutoConnectSerial()
          : await this.tryAutoConnectBluetooth();
      if (ok) return true;
    }

    this.notifyState(false, undefined, false, 0, null);
    return false;
  }

  private async tryAutoConnectSerial(): Promise<boolean> {
    if (!WebBLEPrinter.isSerialSupported()) return false;
    const hasSerialRecord = lsGet(LS.mode) === 'serial' || Boolean(lsGet(LS.serialInfo));
    if (!hasSerialRecord) return false;

    try {
      const port = await this.findSavedSerialPort();
      if (!port) return false;
      await this.openSerialPort(port);

      this.stopReconnectLoop();
      this.serialPort = port;
      this.connectionType = 'serial';
      this.shouldAutoReconnect = true;
      this.reconnectAttempts = 0;
      await this.write(this.CMD.INIT);
      this.notifyState(true, SERIAL_DEVICE_NAME, false, 0, null);
      return true;
    } catch {
      return false;
    }
  }

  private async tryAutoConnectBluetooth(): Promise<boolean> {
    if (!WebBLEPrinter.isSupported()) return false;
    const nav = navigator as any;
    if (typeof nav.bluetooth.getDevices !== 'function') return false;

    try {
      const devices: any[] = await nav.bluetooth.getDevices();
      if (!devices || devices.length === 0) return false;

      const savedId = lsGet(LS.deviceId);
      const savedName = lsGet(LS.deviceName);
      const printerDevice =
        (savedId && devices.find((d) => d.id === savedId)) ||
        (savedName && devices.find((d) => d.name === savedName)) ||
        devices[0];

      this.device = printerDevice;
      this.shouldAutoReconnect = true;
      this.reconnectAttempts = 0;
      this.notifyState(
        false,
        printerDevice.name || savedName || 'Impresora Térmica',
        true,
        1,
        null
      );

      return await this.connectExistingBleDevice(printerDevice, false);
    } catch {
      return false;
    }
  }

  private async connectExistingBleDevice(
    device: any,
    scheduleOnFail: boolean = true
  ): Promise<boolean> {
    try {
      this.stopReconnectLoop();
      device.removeEventListener('gattserverdisconnected', this.handleDisconnection);
      device.addEventListener('gattserverdisconnected', this.handleDisconnection);

      const server = await device.gatt.connect();
      this.server = server;
      let targetService: any = null;

      for (const uuid of this.serviceUUIDs) {
        try {
          targetService = await server.getPrimaryService(uuid);
          if (targetService) break;
        } catch { }
      }

      if (!targetService) {
        const services = await server.getPrimaryServices();
        if (services.length > 0) targetService = services[0];
        else throw new Error('No se encontraron servicios Bluetooth en el dispositivo.');
      }

      const characteristics = await targetService.getCharacteristics();
      this.characteristic = characteristics.find(
        (c: any) => c.properties.write || c.properties.writeWithoutResponse
      );

      if (!this.characteristic) {
        throw new Error('El dispositivo no permite escritura (no es una impresora válida).');
      }

      this.connectionType = 'bluetooth';
      this.reconnectAttempts = 0;
      await this.write(this.CMD.INIT);
      this.notifyState(true, device.name || 'Impresora Térmica', false, 0, null);
      return true;
    } catch {
      this.characteristic = null;
      this.server = null;
      if (scheduleOnFail) this.scheduleReconnect();
      return false;
    }
  }

  private handleDisconnection(): void {
    this.characteristic = null;
    this.server = null;
    this.notifyState(
      false,
      this.getDeviceName(),
      this.shouldAutoReconnect,
      this.reconnectAttempts
    );
    if (this.shouldAutoReconnect) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldAutoReconnect || this.isConnected()) return;
    const mode: 'bluetooth' | 'serial' | null =
      this.connectionType ?? (this.device ? 'bluetooth' : null);
    if (!mode || (mode === 'bluetooth' && !this.device)) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.isReconnecting = false;
      const errorMsg = `No se pudo reconectar después de ${this.maxReconnectAttempts} intentos.`;
      this.notifyState(false, this.getDeviceName(), false, this.reconnectAttempts, errorMsg);
      return;
    }

    this.reconnectAttempts += 1;
    this.isReconnecting = true;
    this.notifyState(false, this.getDeviceName(), true, this.reconnectAttempts, null);

    const delay = Math.min(2000 + (this.reconnectAttempts - 1) * 1000, 5000);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.shouldAutoReconnect || this.isConnected()) return;
      try {
        if (mode === 'serial') {
          const ok = await this.tryAutoConnectSerial();
          if (!ok) this.scheduleReconnect();
          return;
        }
        await this.connectExistingBleDevice(this.device, true);
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  public cancelReconnect(): void {
    this.shouldAutoReconnect = false;
    this.stopReconnectLoop();
    this.notifyState(
      this.isConnected(),
      this.getDeviceName(),
      false,
      this.reconnectAttempts,
      'Reconexión cancelada por el usuario.'
    );
  }

  public async reconnect(): Promise<boolean> {
    if (this.isConnected()) return true;
    this.stopReconnectLoop();
    this.reconnectAttempts = 0;
    this.shouldAutoReconnect = true;
    lsSet(LS.autoConnect, 'true');

    if (this.connectionType === 'serial') {
      if (await this.tryAutoConnectSerial()) return true;
      return await this.autoConnectKnownDevice();
    }
    if (!this.device) {
      return await this.autoConnectKnownDevice();
    }
    return await this.connectExistingBleDevice(this.device, true);
  }

  public async forget(): Promise<void> {
    this.disconnect();
    this.cancelReconnect();
    this.reconnectAttempts = 0;
    this.lastError = null;

    if (typeof localStorage !== 'undefined') {
      Object.values(LS).forEach((key) => localStorage.removeItem(key));
    }

    if (this.device && typeof this.device.forget === 'function') {
      try {
        await this.device.forget();
      } catch { }
    }

    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    if (nav?.bluetooth && typeof nav.bluetooth.getDevices === 'function') {
      try {
        const devices = await nav.bluetooth.getDevices();
        for (const dev of devices) {
          if (typeof dev.forget === 'function') {
            await dev.forget().catch(() => { });
          }
        }
      } catch { }
    }

    if (nav?.serial && typeof nav.serial.getPorts === 'function') {
      try {
        const ports = await nav.serial.getPorts();
        for (const port of ports) {
          if (typeof port.forget === 'function') {
            await port.forget().catch(() => { });
          }
        }
      } catch { }
    }

    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.serialPort = null;
    this.connectionType = null;
    this.shouldAutoReconnect = false;
    this.isReconnecting = false;
    this.notifyState(false, undefined, false, 0, null);
  }
}

// Alias de compatibilidad para el resto de la aplicación
export { WebBLEPrinter as WebBluetoothPrinter };

// Singleton global de WebBLEPrinter
let printerInstance: WebBLEPrinter | null = null;

export function getBluetoothPrinter(): WebBLEPrinter {
  if (!printerInstance) {
    printerInstance = new WebBLEPrinter();
  }
  return printerInstance;
}
