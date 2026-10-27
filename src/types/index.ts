export type UserRole = 'admin' | 'agent' | 'kiosk';

export type TicketStatus = 'waiting' | 'calling' | 'serving' | 'completed' | 'skipped';

export interface SystemSettings {
  companyName: string;
  titleLinesCount?: number;
  titleLines?: string[];
  slogan?: string;
  taxId?: string;
  phone?: string;
  ticketHeader: string;
  ticketFooter: string;
  showBranch: boolean;
  showDateTime: boolean;
  showQueueCount: boolean;
  paperWidth: '58mm' | '80mm';
  theme?: 'dark' | 'light';
  // Thermal Logo settings (optimized for NETUM NT-1809)
  showLogo?: boolean;
  logoDataUrl?: string; // 1-bit processed preview PNG DataURL
  logoSourceDataUrl?: string; // Resized source image DataURL for re-adjusting threshold/size
  logoRasterBase64?: string; // 1-bit packed ESC/POS raster bytes in base64
  logoWidth?: number; // Width in dots (multiple of 8)
  logoHeight?: number; // Height in dots
  logoSizePreset?: 'small' | 'medium' | 'large'; // 144px | 184px | 224px
  logoScaleMode?: 'fast' | 'hd'; // 'fast' uses GS v 0 m=3 (4x fewer bytes, instant print); 'hd' uses m=0
  logoDither?: 'threshold' | 'atkinson';
  logoThreshold?: number; // 0-255 brightness threshold
  logoInvert?: boolean;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone?: string;
  active: boolean;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  prefix: string; // Ej: 'CAJ', 'ATC', 'REC'
  branchIds: string[]; // Branches where this service is available
  active: boolean;
  createdAt: string;
}

export interface Counter {
  id: string;
  name: string; // Ej: 'Ventanilla 1', 'Módulo 2'
  branchId: string;
  serviceIds: string[]; // Services this counter can attend
  active: boolean;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  branchId?: string; // Required for 'agent' and 'kiosk'
  defaultCounterId?: string; // Optional default counter for 'agent'
  active: boolean;
  createdAt: string;
}

export interface DailyCounter {
  count: number;
  lastSequence: number;
  updatedAt: string;
}

export interface Ticket {
  id: string;
  ticketNumber: string; // Ej: 'ATC-001'
  sequence: number;
  branchId: string;
  serviceId: string;
  serviceName: string;
  servicePrefix: string;
  status: TicketStatus;
  counterId?: string;
  counterName?: string;
  agentId?: string;
  agentName?: string;
  dateString: string; // 'YYYY-MM-DD'
  createdAt: number; // Unix timestamp ms or ISO
  calledAt?: number;
  lastCalledAt?: number;
  startedAt?: number;
  completedAt?: number;
}
