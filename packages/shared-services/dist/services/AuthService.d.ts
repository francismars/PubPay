export interface AuthResult {
    success: boolean;
    publicKey?: string;
    privateKey?: string;
    method?: 'extension' | 'externalSigner' | 'nsec';
    error?: string;
}
export declare class AuthService {
    private static readonly METHODS;
    /**
     * Sign in with Nostr extension
     */
    static signInWithExtension(): Promise<AuthResult>;
    /**
     * Sign in with external signer (nostrsigner)
     */
    static signInWithExternalSigner(rememberMe?: boolean): Promise<AuthResult>;
    /**
     * Sign in with nsec (private key)
     */
    static signInWithNsec(nsec: string): Promise<AuthResult>;
    /**
     * Handle external signer return
     */
    static handleExternalSignerReturn(): Promise<AuthResult>;
    /**
     * Access clipboard content
     */
    private static accessClipboard;
    /**
     * Store authentication data
     */
    static storeAuthData(publicKey: string, privateKey: string | null, method: string, rememberMe: boolean): void;
    /**
     * Get stored authentication data
     */
    static getStoredAuthData(): {
        publicKey: string | null;
        privateKey: string | null;
        method: string | null;
    };
    /**
     * Clear authentication data
     */
    static clearAuthData(): void;
    /**
     * Validate stored authentication data
     */
    static validateStoredAuthData(): boolean;
    /**
     * Check if user is authenticated
     */
    static isAuthenticated(): boolean;
    /**
     * Get current user's public key
     */
    static getCurrentUserPublicKey(): string | null;
    /**
     * Get current user's private key
     */
    static getCurrentUserPrivateKey(): string | null;
    /**
     * Get current user's sign-in method
     */
    static getCurrentUserMethod(): string | null;
}
