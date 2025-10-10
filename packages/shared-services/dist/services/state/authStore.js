import { create } from 'zustand';
export const useAuthStore = create((set) => ({
    isLoggedIn: false,
    publicKey: null,
    displayName: null,
    userProfile: null,
    signInMethod: null,
    setAuth: (partial) => set((s) => ({ ...s, ...partial })),
    clearAuth: () => set({ isLoggedIn: false, publicKey: null, displayName: null, userProfile: null, signInMethod: null }),
    setProfile: (profile) => set({ userProfile: profile }),
    setDisplayName: (displayName) => set({ displayName })
}));
