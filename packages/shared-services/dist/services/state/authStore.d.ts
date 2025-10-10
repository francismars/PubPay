type SignInMethod = 'extension' | 'externalSigner' | 'nsec' | null;
type AuthState = {
    isLoggedIn: boolean;
    publicKey: string | null;
    displayName: string | null;
    userProfile: any | null;
    signInMethod: SignInMethod;
    setAuth: (partial: Partial<Omit<AuthState, 'setAuth' | 'clearAuth' | 'setProfile' | 'setDisplayName'>>) => void;
    clearAuth: () => void;
    setProfile: (profile: any | null) => void;
    setDisplayName: (name: string | null) => void;
};
export declare const useAuthStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AuthState>>;
export {};
