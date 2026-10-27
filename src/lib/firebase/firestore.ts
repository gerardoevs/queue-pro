import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  runTransaction,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { getTodayDateString } from '../utils';
import type {
  SystemSettings,
  Branch,
  Service,
  Counter,
  Ticket,
  UserProfile,
} from '@/types';

// Default system settings
export const DEFAULT_SETTINGS: SystemSettings = {
  companyName: 'GEVS Queue Pro',
  titleLinesCount: 1,
  titleLines: ['GEVS Queue Pro'],
  slogan: 'Sistema Inteligente de Gestión de Turnos',
  taxId: 'J-12345678-0',
  phone: '+1 (555) 000-8888',
  ticketHeader: 'BIENVENIDO A SU ATENCIÓN',
  ticketFooter: 'Gracias por su visita. Por favor esté atento a las pantallas.',
  showBranch: true,
  showDateTime: true,
  showQueueCount: true,
  paperWidth: '58mm',
  theme: 'dark',
  showLogo: false,
  logoSizePreset: 'medium',
  logoDither: 'threshold',
  logoThreshold: 145,
  logoInvert: false,
  logoScaleMode: 'fast',
};

// 1. Settings functions
export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const docRef = doc(db, 'settings', 'general');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as SystemSettings;
    }
    // If not exists, save default settings
    await setDoc(docRef, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Error fetching settings:', error);
    return DEFAULT_SETTINGS;
  }
}

export async function updateSystemSettings(settings: Partial<SystemSettings>): Promise<void> {
  const docRef = doc(db, 'settings', 'general');
  await setDoc(docRef, settings, { merge: true });
}

// 2. Ticket generation with atomic transaction
export async function createTicketTransaction(params: {
  branchId: string;
  serviceId: string;
  serviceName: string;
  servicePrefix: string;
}): Promise<{ ticket: Ticket; peopleAhead: number }> {
  const { branchId, serviceId, serviceName, servicePrefix } = params;
  const dateString = getTodayDateString();
  const counterDocRef = doc(db, 'daily_counters', `${branchId}_${serviceId}_${dateString}`);
  const ticketsCollRef = collection(db, 'tickets');
  const newTicketDocRef = doc(ticketsCollRef);

  return await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterDocRef);
    let nextSequence = 1;

    if (counterSnap.exists()) {
      const data = counterSnap.data();
      nextSequence = (data.lastSequence || 0) + 1;
    }

    const paddedNum = String(nextSequence).padStart(3, '0');
    const ticketNumber = `${servicePrefix.toUpperCase()}-${paddedNum}`;

    // Update or create counter
    transaction.set(
      counterDocRef,
      {
        count: nextSequence,
        lastSequence: nextSequence,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    const now = Date.now();
    const newTicket: Ticket = {
      id: newTicketDocRef.id,
      ticketNumber,
      sequence: nextSequence,
      branchId,
      serviceId,
      serviceName,
      servicePrefix: servicePrefix.toUpperCase(),
      status: 'waiting',
      dateString,
      createdAt: now,
    };

    transaction.set(newTicketDocRef, newTicket);

    // Calculate approximate people ahead
    return {
      ticket: newTicket,
      peopleAhead: Math.max(0, nextSequence - 1),
    };
  });
}

// 3. Count waiting tickets for branch
export async function getWaitingTicketsCount(branchId: string, serviceId?: string): Promise<number> {
  try {
    let q = query(
      collection(db, 'tickets'),
      where('branchId', '==', branchId),
      where('status', '==', 'waiting')
    );
    if (serviceId) {
      q = query(q, where('serviceId', '==', serviceId));
    }
    const snap = await getDocs(q);
    return snap.size;
  } catch (err) {
    console.error('Error counting waiting tickets:', err);
    return 0;
  }
}

// 4. Update ticket status
export async function updateTicketStatus(
  ticketId: string,
  updates: Partial<Ticket>
): Promise<void> {
  const ticketRef = doc(db, 'tickets', ticketId);
  await updateDoc(ticketRef, updates);
}
