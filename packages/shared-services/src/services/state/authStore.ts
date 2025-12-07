import { create } from 'zustand';
import type { Kind0Event } from '@pubpay/shared-types';

export type SignInMethod = 'extension' | 'externalSigner' | 'nsec' | null;

export interface AuthState {
  isLoggedIn: boolean;
  publicKey: string | null;
  privateKey: string | null; // Kept in interface for backward compatibility, but stored in local state in useAuth
  signInMethod: SignInMethod;
  userProfile: Kind0Event | null;
  displayName: string | null;
}

interface AuthStore {
  isLoggedIn: boolean;
  publicKey: string | null;
  signInMethod: SignInMethod;
  userProfile: Kind0Event | null;
  displayName: string | null;
  setAuth: (
    partial: Partial<Omit<AuthStore, 'setAuth' | 'clearAuth' | 'setProfile' | 'setDisplayName'>>
  ) => void;
  clearAuth: () => void;
  setProfile: (profile: Kind0Event | null) => void;
  setDisplayName: (name: string | null) => void;
}

export const useAuthStore = create<AuthStore>(set => ({
  isLoggedIn: false,
  publicKey: null,
  displayName: null,
  userProfile: null,
  signInMethod: null,
  setAuth: partial => set(s => ({ ...s, ...partial })),
  clearAuth: () =>
    set({
      isLoggedIn: false,
      publicKey: null,
      displayName: null,
      userProfile: null,
      signInMethod: null
    }),
  setProfile: profile => set({ userProfile: profile }),
  setDisplayName: displayName => set({ displayName })
}));
