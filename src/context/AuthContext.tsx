'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import type { UserProfile, UserRole } from '@/types';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const unsubscribeSnapshotRef = useRef<(() => void) | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Load and listen to user profile in Firestore
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubscribeSnapshotRef.current) {
        unsubscribeSnapshotRef.current();
        unsubscribeSnapshotRef.current = null;
      }

      setUser(currentUser);
      if (currentUser) {
        // Setup live listener for profile changes (role, active status, etc.)
        const userRef = doc(db, 'users', currentUser.uid);
        unsubscribeSnapshotRef.current = onSnapshot(
          userRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              setProfile(data);
            } else {
              setProfile(null);
            }
            setLoading(false);
          },
          (error) => {
            if (error.code !== 'permission-denied') {
              console.error('Error listening to user profile:', error);
            }
            setLoading(false);
          }
        );
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshotRef.current) {
        unsubscribeSnapshotRef.current();
        unsubscribeSnapshotRef.current = null;
      }
    };
  }, []);

  const login = useCallback(
    async (email: string, pass: string): Promise<UserProfile> => {
      setLoading(true);
      try {
        let cred;
        // Attempt sign in with automatic retry for transient service/network errors
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            cred = await signInWithEmailAndPassword(auth, email, pass);
            break;
          } catch (err: any) {
            const isTransient =
              err.code === 'auth/the-service-is-currently-unavailable' ||
              err.code === 'auth/network-request-failed' ||
              err.code === 'auth/timeout' ||
              err.message?.includes('the-service-is-currently-unavailable') ||
              err.message?.includes('network-request-failed');

            if (isTransient && attempt < 3) {
              console.warn(`Intento ${attempt} de inicio de sesión falló por disponibilidad del servicio. Reintentando en ${attempt * 600}ms...`);
              await new Promise((res) => setTimeout(res, attempt * 600));
              continue;
            }
            throw err;
          }
        }

        if (!cred) {
          throw new Error('No se pudo establecer la sesión.');
        }

        const userDoc = await getDoc(doc(db, 'users', cred.user.uid));

        if (!userDoc.exists()) {
          throw new Error('El usuario no tiene un perfil registrado en el sistema.');
        }

        const userProfile = userDoc.data() as UserProfile;

        if (!userProfile.active) {
          await firebaseSignOut(auth);
          throw new Error('Esta cuenta de usuario se encuentra inactiva o deshabilitada.');
        }

        setProfile(userProfile);
        return userProfile;
      } catch (err: any) {
        setLoading(false);
        throw err;
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      if (unsubscribeSnapshotRef.current) {
        unsubscribeSnapshotRef.current();
        unsubscribeSnapshotRef.current = null;
      }
      setProfile(null);
      setUser(null);
      // Allow dependent components to unmount and clean up Firestore listeners before revoking auth token
      await new Promise((resolve) => setTimeout(resolve, 0));
      await firebaseSignOut(auth);
      router.replace('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  }, [router]);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (snap.exists()) {
        setProfile(snap.data() as UserProfile);
      }
    } catch (err) {
      console.error('Error refreshing profile:', err);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
