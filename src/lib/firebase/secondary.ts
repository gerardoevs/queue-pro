import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, type Auth } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { firebaseConfig, db } from './config';
import type { UserProfile, UserRole } from '@/types';

/**
 * Creates a new user in Firebase Auth and saves their profile to Firestore
 * WITHOUT terminating or replacing the current user's session.
 * Uses a secondary Firebase App instance.
 */
export async function createNewUserWithoutLosingSession(params: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  branchId?: string;
  defaultCounterId?: string;
}): Promise<UserProfile> {
  const { name, email, password, role, branchId, defaultCounterId } = params;

  // Initialize or retrieve secondary app
  let secondaryApp: FirebaseApp;
  const existingApp = getApps().find((a) => a.name === 'SecondaryAuth');
  if (existingApp) {
    secondaryApp = existingApp;
  } else {
    secondaryApp = initializeApp(firebaseConfig, 'SecondaryAuth');
  }

  const secondaryAuth: Auth = getAuth(secondaryApp);

  try {
    // 1. Create user in Firebase Auth using the secondary auth instance
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const user = credential.user;

    // 2. Prepare user profile document
    const userProfile: UserProfile = {
      uid: user.uid,
      name,
      email,
      role,
      branchId: branchId || '',
      defaultCounterId: defaultCounterId || '',
      active: true,
      createdAt: new Date().toISOString(),
    };

    // 3. Save profile to Firestore using primary db instance
    await setDoc(doc(db, 'users', user.uid), userProfile);

    // 4. Sign out the secondary instance to clean up
    await signOut(secondaryAuth);

    return userProfile;
  } catch (error) {
    // Ensure secondary auth is signed out even on failure
    try {
      await signOut(secondaryAuth);
    } catch {
      // Ignore cleanup error
    }
    throw error;
  }
}
