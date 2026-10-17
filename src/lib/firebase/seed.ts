import { collection, getDocs, doc, setDoc, limit, query } from 'firebase/firestore';
import { db } from './config';
import { createNewUserWithoutLosingSession } from './secondary';
import { DEFAULT_SETTINGS } from './firestore';
import type { Branch, Service, Counter } from '@/types';

export interface SeedResult {
  success: boolean;
  message: string;
  adminCredentials?: { email: string; pass: string };
  agentCredentials?: { email: string; pass: string };
  kioskCredentials?: { email: string; pass: string };
}

/**
 * Checks if the system already has any registered users.
 */
export async function checkIfUsersExist(): Promise<boolean> {
  try {
    const q = query(collection(db, 'users'), limit(1));
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (err) {
    console.warn('Error checking if users exist:', err);
    return false;
  }
}

/**
 * Seeds initial demo data (Settings, Branch, Services, Counters, and Default Users).
 */
export async function seedInitialSystemData(): Promise<SeedResult> {
  try {
    // 1. Seed Default Branch
    const mainBranchId = 'branch-main';
    const mainBranch: Branch = {
      id: mainBranchId,
      name: 'Sucursal Central',
      address: 'Av. Libertador #1042, Edificio Empresarial',
      phone: '+1 (555) 234-5678',
      active: true,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'branches', mainBranchId), mainBranch);

    // 2. Seed Default Services
    const services: Service[] = [
      {
        id: 'srv-caja',
        name: 'Caja y Pagos',
        prefix: 'CAJ',
        branchIds: [mainBranchId],
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'srv-atc',
        name: 'Atención al Cliente',
        prefix: 'ATC',
        branchIds: [mainBranchId],
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'srv-rec',
        name: 'Reclamos y Devoluciones',
        prefix: 'REC',
        branchIds: [mainBranchId],
        active: true,
        createdAt: new Date().toISOString(),
      },
    ];

    for (const srv of services) {
      await setDoc(doc(db, 'services', srv.id), srv);
    }

    // 3. Seed Default Counters
    const counters: Counter[] = [
      {
        id: 'counter-1',
        name: 'Ventanilla 1 (Principal)',
        branchId: mainBranchId,
        serviceIds: ['srv-caja', 'srv-atc', 'srv-rec'],
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'counter-2',
        name: 'Ventanilla 2 (Rápida)',
        branchId: mainBranchId,
        serviceIds: ['srv-caja'],
        active: true,
        createdAt: new Date().toISOString(),
      },
    ];

    for (const ctr of counters) {
      await setDoc(doc(db, 'counters', ctr.id), ctr);
    }

    // 4. Seed Users
    const adminPass = 'Admin123!';
    const agentPass = 'Agente123!';
    const kioskPass = 'Kiosko123!';

    // Create Admin
    await createNewUserWithoutLosingSession({
      name: 'Administrador General',
      email: 'admin@queuepro.com',
      password: adminPass,
      role: 'admin',
    });

    // Create Agent
    await createNewUserWithoutLosingSession({
      name: 'Operador de Ventanilla 1',
      email: 'agente@queuepro.com',
      password: agentPass,
      role: 'agent',
      branchId: mainBranchId,
      defaultCounterId: 'counter-1',
    });

    // Create Kiosk
    await createNewUserWithoutLosingSession({
      name: 'Tótem Táctil Central',
      email: 'kiosko@queuepro.com',
      password: kioskPass,
      role: 'kiosk',
      branchId: mainBranchId,
    });

    // 5. Finally, Seed Settings (locks bootstrap mode)
    await setDoc(doc(db, 'settings', 'general'), DEFAULT_SETTINGS, { merge: true });

    return {
      success: true,
      message: 'Sistema inicializado exitosamente con datos de demostración.',
      adminCredentials: { email: 'admin@queuepro.com', pass: adminPass },
      agentCredentials: { email: 'agente@queuepro.com', pass: agentPass },
      kioskCredentials: { email: 'kiosko@queuepro.com', pass: kioskPass },
    };
  } catch (error: any) {
    console.error('Error seeding initial system data:', error);
    return {
      success: false,
      message: error?.message || 'Error al inicializar el sistema',
    };
  }
}
