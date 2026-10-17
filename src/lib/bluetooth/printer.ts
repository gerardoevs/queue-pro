// Known thermal printer BLE service UUIDs
const COMMON_PRINTER_SERVICES = [
  '0000ae30-0000-1000-8000-00805f9b34fb', // NETUM NT-1809 / NT-1809DD / Zhuhai
  '0000ae00-0000-1000-8000-00805f9b34fb', // NETUM alternative base
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Thermal Printer Service
  '0000ff00-0000-1000-8000-00805f9b34fb', // Common ESC/POS BLE
  '0000ff02-0000-1000-8000-00805f9b34fb', // Generic Chinese 58mm / Goojprt
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / MPT-II / Goojprt
  '0000fff0-0000-1000-8000-00805f9b34fb', // Rongta / Milestone / Gprinter
  '0000fee7-0000-1000-8000-00805f9b34fb', // Tencent / IoT Mini Printers
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent UART
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // PosBank / Xprinter
  '000018f1-0000-1000-8000-00805f9b34fb', // Custom thermal printer service
  '00001101-0000-1000-8000-00805f9b34fb', // Serial Port Profile (SPP)
];

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
  /** navigator.bluetooth.getDevices() — required to reconnect BLE without the picker */
  persistentBluetoothPermissions: boolean;
  /** BluetoothDevice.watchAdvertisements() — lets us wait until the printer is actually on */
  watchAdvertisements: boolean;
  webSerial: boolean;
}

export class WebBluetoothPrinter {
  private device: any = null;
  private server: any = null;
  private characteristic: any = null;
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
  // Shared in-flight auto-connect so React StrictMode / multiple callers never open the device twice
  private autoConnectPromise: Promise<boolean> | null = null;
  private serialListenersAttached: boolean = false;

  constructor() {
    this.handleDisconnection = this.handleDisconnection.bind(this);
    this.handleSerialConnect = this.handleSerialConnect.bind(this);
    this.handleSerialDisconnect = this.handleSerialDisconnect.bind(this);
    this.releaseForUnload = this.releaseForUnload.bind(this);

    if (typeof window !== 'undefined') {
      // Free the GATT link / COM handle on reload so the next page load can reopen it immediately
      window.addEventListener('pagehide', this.releaseForUnload);
      // Page restored from back/forward cache: the link was released on pagehide, so reconnect
      window.addEventListener('pageshow', (event: PageTransitionEvent) => {
        if (event.persisted) this.autoConnectKnownDevice().catch(() => {});
      });
    }
  }

  // Check if Web Bluetooth is available in current browser
  public static isSupported(): boolean {
    return typeof window !== 'undefined' && 'bluetooth' in navigator;
  }

  // Check if Web Serial is available (USB or Bluetooth COM Port on Windows)
  public static isSerialSupported(): boolean {
    return typeof window !== 'undefined' && 'serial' in navigator;
  }

  // Report which browser features needed for silent reconnection are available
  public static getCapabilities(): PrinterCapabilities {
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    const bt = nav?.bluetooth;
    const BluetoothDeviceCtor = typeof window !== 'undefined' ? (window as any).BluetoothDevice : undefined;
    return {
      webBluetooth: Boolean(bt),
      persistentBluetoothPermissions: typeof bt?.getDevices === 'function',
      watchAdvertisements: typeof BluetoothDeviceCtor?.prototype?.watchAdvertisements === 'function',
      webSerial: Boolean(nav?.serial),
    };
  }

  // Subscribe to connection state changes
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
    return Boolean(this.device && this.server && this.server.connected && this.characteristic);
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

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  // Stop the retry timer without changing the user's auto-connect preference
  private stopReconnectLoop(): void {
    this.isReconnecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // Release hardware handles after a failure WITHOUT disabling auto-connect.
  // (Previously failures called disconnect(), which permanently turned auto-connect off.)
  private teardown(): void {
    this.stopReconnectLoop();

    if (this.serialPort) {
      try {
        this.serialPort.close().catch(() => {});
      } catch {}
      this.serialPort = null;
    }

    if (this.device) {
      try {
        this.device.removeEventListener('gattserverdisconnected', this.handleDisconnection);
      } catch {}
      if (this.device.gatt?.connected) {
        try {
          this.device.gatt.disconnect();
        } catch (err) {
          console.warn('Error during disconnect:', err);
        }
      }
    }

    this.server = null;
    this.characteristic = null;
  }

  private releaseForUnload(): void {
    this.stopReconnectLoop();
    try {
      this.serialPort?.close?.().catch(() => {});
    } catch {}
    try {
      if (this.device) {
        // Detach first so the unload disconnect doesn't kick off a reconnect loop
        this.device.removeEventListener('gattserverdisconnected', this.handleDisconnection);
        if (this.device.gatt?.connected) this.device.gatt.disconnect();
      }
    } catch {}
  }

  // Open a serial port, preferring the last baud rate that worked
  private async openSerialPort(port: any): Promise<void> {
    if (port.writable) return; // Already open in this page

    const savedBaud = Number(lsGet(LS.serialBaud)) || 9600;
    const bauds = Array.from(new Set([savedBaud, 9600, 115200]));
    let lastErr: any = null;

    for (const baudRate of bauds) {
      try {
        await port.open({ baudRate });
        lsSet(LS.serialBaud, String(baudRate));
        return;
      } catch (err: any) {
        // InvalidStateError = the port is already open (e.g. concurrent open in this page)
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
    } catch {}
  }

  // Find the previously authorized COM/USB port that matches the one the user picked before
  private async findSavedSerialPort(): Promise<any | null> {
    const nav = navigator as any;
    if (typeof nav.serial?.getPorts !== 'function') return null;

    const ports: any[] = await nav.serial.getPorts();
    if (!ports || ports.length === 0) return null;

    let saved: Record<string, unknown> | null = null;
    try {
      saved = JSON.parse(lsGet(LS.serialInfo) || 'null');
    } catch {}

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

  // A previously authorized port came back (printer powered on / cable plugged in)
  private handleSerialConnect(): void {
    if (this.isConnected() || lsGet(LS.autoConnect) === 'false') return;
    this.autoConnectKnownDevice().catch(() => {});
  }

  private handleSerialDisconnect(event: any): void {
    if (this.connectionType !== 'serial') return;
    if (event?.target && this.serialPort && event.target !== this.serialPort) return;

    console.log('Puerto serie de la impresora desconectado.');
    this.serialPort = null;
    this.notifyState(false, SERIAL_DEVICE_NAME, this.shouldAutoReconnect, this.reconnectAttempts);
    if (this.shouldAutoReconnect) this.scheduleReconnect();
  }

  // Wait until the BLE printer is actually advertising (i.e. powered on and in range).
  // Connecting to a getDevices() device before Chrome has seen it in this session
  // usually fails with "Bluetooth Device is no longer in range".
  private waitForAdvertisement(device: any, timeoutMs: number): Promise<boolean> {
    if (typeof device?.watchAdvertisements !== 'function') return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
      const abort = new AbortController();
      let done = false;

      const finish = (seen: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        device.removeEventListener('advertisementreceived', onAdvertisement);
        abort.abort();
        resolve(seen);
      };
      const onAdvertisement = () => finish(true);
      const timer = setTimeout(() => finish(false), timeoutMs);

      device.addEventListener('advertisementreceived', onAdvertisement);
      device.watchAdvertisements({ signal: abort.signal }).catch(() => finish(false));
    });
  }

  // ---------------------------------------------------------------------------
  // Public connection API
  // ---------------------------------------------------------------------------

  // 1. Connect via Web Serial API (USB cable or Windows Bluetooth COM Port)
  public async connectSerial(): Promise<boolean> {
    if (!WebBluetoothPrinter.isSerialSupported()) {
      throw new Error(
        'Web Serial no es compatible con este navegador. Por favor usa Google Chrome o Microsoft Edge en Windows.'
      );
    }

    try {
      const nav = navigator as any;
      const port = await nav.serial.requestPort();
      if (!port) return false;

      // Release any previous link, but never close the port the user just picked
      this.stopReconnectLoop();
      if (this.serialPort && this.serialPort !== port) {
        await this.serialPort.close().catch(() => {});
      }
      if (this.device) {
        try {
          this.device.removeEventListener('gattserverdisconnected', this.handleDisconnection);
          if (this.device.gatt?.connected) this.device.gatt.disconnect();
        } catch {}
      }
      this.server = null;
      this.characteristic = null;

      // NETUM NT-1809 and thermal printers typically operate at 9600 baud (or 115200)
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

      this.notifyState(true, SERIAL_DEVICE_NAME, false, 0, null);
      return true;
    } catch (error: any) {
      if (error?.name === 'NotFoundError') {
        console.log('Selección de puerto serie cancelada por el usuario.');
        return false;
      }
      this.teardown();
      this.notifyState(false, undefined, false, 0, error?.message ?? null);
      throw error;
    }
  }

  // 2. Connect to a Bluetooth thermal printer via BLE user picker
  public async connect(): Promise<boolean> {
    if (!WebBluetoothPrinter.isSupported()) {
      throw new Error(
        'Web Bluetooth no es compatible con este navegador. Por favor use Google Chrome o Microsoft Edge.'
      );
    }

    try {
      this.stopReconnectLoop();
      this.reconnectAttempts = 0;
      this.shouldAutoReconnect = true;
      const nav = navigator as any;
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: COMMON_PRINTER_SERVICES,
      });

      if (!device) {
        throw new Error('No se seleccionó ningún dispositivo.');
      }

      // Close a serial link if the user is switching to Bluetooth
      if (this.serialPort) {
        await this.serialPort.close().catch(() => {});
        this.serialPort = null;
      }

      this.device = device;
      this.connectionType = 'bluetooth';
      lsSet(LS.mode, 'bluetooth');
      lsSet(LS.autoConnect, 'true');
      if (device.name) lsSet(LS.deviceName, device.name);
      if (device.id) lsSet(LS.deviceId, device.id);
      return await this.connectGatt(device);
    } catch (error: any) {
      if (error?.name === 'NotFoundError') {
        console.log('Selección de dispositivo Bluetooth cancelada por el usuario.');
        this.notifyState(this.isConnected(), this.getDeviceName(), false, 0, null);
        return false;
      }
      this.teardown();
      this.notifyState(false, undefined, false, 0, error?.message ?? null);
      throw error;
    }
  }

  // Auto-connect to previously paired device without showing any picker
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

    // Respect an explicit "Desconectar" by the user
    if (lsGet(LS.autoConnect) === 'false') return false;

    const savedMode = lsGet(LS.mode) as 'bluetooth' | 'serial' | null;
    this.attachSerialListeners();

    // Give Windows / Chrome 700ms on page reload to close the previous GATT / COM socket
    await new Promise((resolve) => setTimeout(resolve, 700));

    const order: Array<'bluetooth' | 'serial'> =
      savedMode === 'bluetooth' ? ['bluetooth', 'serial'] : ['serial', 'bluetooth'];

    for (const mode of order) {
      const ok = mode === 'serial' ? await this.tryAutoConnectSerial() : await this.tryAutoConnectBluetooth();
      if (ok) return true;
    }

    // Printer not reachable yet (still off / booting): keep retrying the preferred mode in background
    const canRetry =
      (savedMode === 'serial' && WebBluetoothPrinter.isSerialSupported()) ||
      (savedMode === 'bluetooth' && Boolean(this.device));

    if (canRetry) {
      this.shouldAutoReconnect = true;
      this.connectionType = savedMode;
      this.reconnectAttempts = 0;
      this.scheduleReconnect();
    } else {
      this.notifyState(false, undefined, false, 0, null);
    }
    return false;
  }

  private async tryAutoConnectSerial(): Promise<boolean> {
    if (!WebBluetoothPrinter.isSerialSupported()) return false;

    // Never grab an unrelated serial device the user didn't choose for printing
    const hasSerialRecord = lsGet(LS.mode) === 'serial' || Boolean(lsGet(LS.serialInfo));
    if (!hasSerialRecord) return false;

    try {
      const port = await this.findSavedSerialPort();
      if (!port) {
        console.info(
          '[Impresora] Chrome no tiene ningún puerto COM/USB autorizado para este sitio. Conéctala una vez con "Conectar por Puerto COM / USB".'
        );
        return false;
      }

      await this.openSerialPort(port);

      this.stopReconnectLoop();
      this.serialPort = port;
      this.connectionType = 'serial';
      this.shouldAutoReconnect = true;
      this.reconnectAttempts = 0;
      this.notifyState(true, SERIAL_DEVICE_NAME, false, 0, null);
      return true;
    } catch (err) {
      console.warn('Reapertura de puerto serie omitida (¿impresora apagada?):', err);
      return false;
    }
  }

  private async tryAutoConnectBluetooth(): Promise<boolean> {
    if (!WebBluetoothPrinter.isSupported()) return false;
    const nav = navigator as any;

    if (typeof nav.bluetooth.getDevices !== 'function') {
      console.info(
        '[Impresora] navigator.bluetooth.getDevices() no está disponible. Activa chrome://flags/#enable-web-bluetooth-new-permissions-backend para reconectar por Bluetooth sin que aparezca el selector.'
      );
      return false;
    }

    try {
      const devices: any[] = await nav.bluetooth.getDevices();
      if (!devices || devices.length === 0) {
        console.info(
          '[Impresora] Chrome no recuerda ningún dispositivo Bluetooth autorizado para este sitio. Vincúlala una vez con "Conectar Bluetooth".'
        );
        return false;
      }

      const savedId = lsGet(LS.deviceId);
      const savedName = lsGet(LS.deviceName);
      const printerDevice =
        (savedId && devices.find((d) => d.id === savedId)) ||
        (savedName && devices.find((d) => d.name === savedName)) ||
        devices[0];

      this.device = printerDevice;
      this.shouldAutoReconnect = true;
      this.reconnectAttempts = 0;

      // Notify state that auto-reconnect is starting
      this.notifyState(false, printerDevice.name || savedName || 'Impresora Térmica', true, 1, null);

      // Wait (max 6s) until the printer is seen advertising, then connect
      const seen = await this.waitForAdvertisement(printerDevice, 6000);
      if (!seen && WebBluetoothPrinter.getCapabilities().watchAdvertisements) {
        console.info('[Impresora] No se detectó la impresora anunciándose por BLE; intentando conexión directa.');
      }

      return await this.connectGatt(printerDevice, false);
    } catch (err) {
      console.warn('Auto-connect to known device skipped:', err);
      return false;
    }
  }

  // Internal GATT connection & discovery logic with stabilized handshake
  private async connectGatt(device: any, scheduleOnFail: boolean = true): Promise<boolean> {
    try {
      this.isReconnecting = false;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      device.removeEventListener('gattserverdisconnected', this.handleDisconnection);
      device.addEventListener('gattserverdisconnected', this.handleDisconnection);

      // Connect GATT server
      const server = await device.gatt.connect();
      this.server = server;

      // Small pause for Windows BLE driver to establish session
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (!server.connected) {
        throw new Error(
          'Windows desconectó el enlace GATT. Si la impresora está vinculada en la Configuración de Windows, quítala de allí para usar Bluetooth BLE, o utiliza el botón "Conectar por Puerto COM / USB".'
        );
      }

      const savedService = lsGet(LS.serviceUuid);

      const probeList = savedService
        ? [savedService, ...COMMON_PRINTER_SERVICES.filter((s) => s.toLowerCase() !== savedService.toLowerCase())]
        : COMMON_PRINTER_SERVICES;

      let writeChar: any = null;
      let matchedServiceUuid: string | null = null;

      // 1. Direct targeted probe of known printer UUIDs (prevents overloading printer MCU with getPrimaryServices)
      for (const serviceUuid of probeList) {
        if (!server.connected) break;
        try {
          const service = await server.getPrimaryService(serviceUuid);
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              writeChar = char;
              matchedServiceUuid = serviceUuid;
              console.log(
                `[Bluetooth] Característica de impresión encontrada en servicio: ${serviceUuid} (char: ${char.uuid})`
              );
              break;
            }
          }
          if (writeChar) break;
        } catch {
          // Service not supported on this device, proceed to next
        }
      }

      // 2. Fallback: only if direct probe didn't match and server is still connected
      if (!writeChar && server.connected) {
        try {
          const services = await server.getPrimaryServices();
          for (const service of services) {
            try {
              const characteristics = await service.getCharacteristics();
              for (const char of characteristics) {
                if (char.properties.write || char.properties.writeWithoutResponse) {
                  writeChar = char;
                  matchedServiceUuid = service.uuid;
                  break;
                }
              }
              if (writeChar) break;
            } catch {}
          }
        } catch (err) {
          console.warn('Fallback getPrimaryServices omitido:', err);
        }
      }

      if (!writeChar) {
        throw new Error('No se encontró una característica de escritura ESC/POS en el dispositivo.');
      }

      if (matchedServiceUuid) {
        lsSet(LS.serviceUuid, matchedServiceUuid);
      }

      this.characteristic = writeChar;
      this.connectionType = 'bluetooth';
      this.reconnectAttempts = 0;
      this.notifyState(true, device.name || 'Impresora Térmica', false, 0, null);
      return true;
    } catch (err: any) {
      console.warn('GATT connection failed:', err);
      this.characteristic = null;
      this.server = null;
      if (scheduleOnFail) this.scheduleReconnect();
      return false;
    }
  }

  // Disconnection handler when hardware loses link or powers off
  private handleDisconnection(): void {
    console.log('Bluetooth thermal printer disconnected.');
    this.characteristic = null;
    this.server = null;
    this.notifyState(false, this.getDeviceName(), this.shouldAutoReconnect, this.reconnectAttempts);

    if (this.shouldAutoReconnect) {
      this.scheduleReconnect();
    }
  }

  // Automatic reconnection retry loop (Bluetooth or Serial) with attempt limit and clean state
  private scheduleReconnect(): void {
    if (!this.shouldAutoReconnect || this.isConnected()) return;

    const mode: 'bluetooth' | 'serial' | null = this.connectionType ?? (this.device ? 'bluetooth' : null);
    if (!mode || (mode === 'bluetooth' && !this.device)) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.isReconnecting = false;
      const errorMsg = `No se pudo reconectar después de ${this.maxReconnectAttempts} intentos. Verifica que la impresora esté encendida.`;
      console.warn(errorMsg);
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

      console.log(
        `Reintentando conexión ${mode === 'serial' ? 'serie' : 'Bluetooth'} (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );
      try {
        if (mode === 'serial') {
          const connected = await this.tryAutoConnectSerial();
          if (connected) {
            console.log('¡Reconexión automática con la impresora exitosa!');
          } else {
            this.scheduleReconnect();
          }
          return;
        }

        await this.waitForAdvertisement(this.device, 3000);
        const connected = await this.connectGatt(this.device); // schedules next attempt on failure
        if (connected) {
          console.log('¡Reconexión automática con la impresora exitosa!');
          this.reconnectAttempts = 0;
        }
      } catch (err) {
        console.warn('Fallo en intento de reconexión:', err);
        this.scheduleReconnect();
      }
    }, delay);
  }

  // Cancel any active reconnect loop without forgetting device
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

  // Manual reconnect trigger
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

    return await this.connectGatt(this.device);
  }

  // Explicit disconnect by user (disables auto-connect until the user connects again)
  public disconnect(): void {
    this.shouldAutoReconnect = false;
    this.reconnectAttempts = 0;
    lsSet(LS.autoConnect, 'false');

    this.teardown();
    this.connectionType = null;
    this.notifyState(false, undefined, false, 0, null);
  }

  // Completely forgets the printer, revoking browser permission if supported and resetting all state
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
        console.log('Dispositivo Bluetooth olvidado mediante device.forget().');
      } catch (err) {
        console.warn('Error llamando a device.forget():', err);
      }
    }

    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    if (nav?.bluetooth && typeof nav.bluetooth.getDevices === 'function') {
      try {
        const devices = await nav.bluetooth.getDevices();
        for (const dev of devices) {
          if (typeof dev.forget === 'function') {
            await dev.forget().catch(() => {});
          }
        }
      } catch (err) {
        console.warn('Error limpiando getDevices():', err);
      }
    }

    if (nav?.serial && typeof nav.serial.getPorts === 'function') {
      try {
        const ports = await nav.serial.getPorts();
        for (const port of ports) {
          if (typeof port.forget === 'function') {
            await port.forget().catch(() => {});
          }
        }
      } catch (err) {
        console.warn('Error limpiando puertos serie:', err);
      }
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

  // Print raw byte buffer (supports both Web Serial and Web Bluetooth BLE)
  public async print(buffer: Uint8Array): Promise<void> {
    // Acquire sequential lock so consecutive or rapid prints never interleave or overload the hardware
    const currentLock = this.printLock;
    let releaseLock: () => void = () => {};
    this.printLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    try {
      await currentLock;
      await this.executePrint(buffer);
      // Small pause after print to let the thermal head and paper feed mechanism settle
      await new Promise((resolve) => setTimeout(resolve, 150));
    } finally {
      releaseLock();
    }
  }

  private async executePrint(buffer: Uint8Array): Promise<void> {
    if (!this.isConnected()) {
      const reconnected = await this.reconnect();
      if (!reconnected || !this.isConnected()) {
        throw new Error('La impresora no está conectada y no pudo reconectarse.');
      }
    }

    // A. Web Serial transmission (USB or Bluetooth COM Port)
    if (this.connectionType === 'serial' && this.serialPort?.writable) {
      const writer = this.serialPort.writable.getWriter();
      try {
        const SERIAL_CHUNK_SIZE = 64;
        for (let offset = 0; offset < buffer.length; offset += SERIAL_CHUNK_SIZE) {
          const chunk = buffer.slice(offset, offset + SERIAL_CHUNK_SIZE);
          await writer.write(chunk);
          if (offset + SERIAL_CHUNK_SIZE < buffer.length) {
            await new Promise((resolve) => setTimeout(resolve, 15));
          }
        }
      } finally {
        writer.releaseLock();
      }
      return;
    }

    // B. Web Bluetooth BLE transmission
    if (!this.characteristic) {
      throw new Error('No se encontró característica de escritura BLE.');
    }

    // Standard BLE ATT MTU default is 23 bytes (maximum payload = 20 bytes).
    // Using 20 bytes is universally safe for all Bluetooth LE thermal printers (e.g. NETUM NT-1809, Goojprt).
    const BLE_CHUNK_SIZE = 20;
    const totalBytes = buffer.length;

    for (let offset = 0; offset < totalBytes; offset += BLE_CHUNK_SIZE) {
      const chunk = buffer.slice(offset, offset + BLE_CHUNK_SIZE);
      if (this.characteristic.properties.writeWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(chunk);
        await new Promise((resolve) => setTimeout(resolve, 25));
      } else if (this.characteristic.properties.write) {
        await this.characteristic.writeValueWithResponse(chunk);
        await new Promise((resolve) => setTimeout(resolve, 10));
      } else {
        await this.characteristic.writeValue(chunk);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  }
}

// Global Singleton for WebBluetoothPrinter
let printerInstance: WebBluetoothPrinter | null = null;

export function getBluetoothPrinter(): WebBluetoothPrinter {
  if (!printerInstance) {
    printerInstance = new WebBluetoothPrinter();
  }
  return printerInstance;
}
