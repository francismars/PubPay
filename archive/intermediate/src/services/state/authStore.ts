import { create } from 'zustand';

type SignInMethod = 'extension' | 'externalSigner' | 'nsec' | null;

type AuthState = {
  isLoggedIn: boolean;
  publicKey: string | null;
  displayName: string | null;
  userProfile: any | null;
  signInMethod: SignInMethod;
  setAuth: (
    partial: Partial<
      Omit<AuthState, 'setAuth' | 'clearAuth' | 'setProfile' | 'setDisplayName'>
    >
  ) => void;
  clearAuth: () => void;
  setProfile: (profile: any | null) => void;
  setDisplayName: (name: string | null) => void;
};

export const useAuthStore = create<AuthState>(set => ({
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
