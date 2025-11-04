export interface AuthResult {
    success: boolean;
    publicKey?: string;
    privateKey?: string;
    method?: 'extension' | 'externalSigner' | 'nsec';
    error?: string;
}
export interface EncryptedPrivateKey {
    encrypted: string;
    salt: string;
    iv: string;
    hasPassword: boolean;
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
    static signInWithExternalSigner(): Promise<AuthResult>;
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
     * Get or create device key for encryption
     */
    private static getOrCreateDeviceKey;
    /**
     * Derive encryption key from device key
     */
    private static deriveDeviceEncryptionKey;
    /**
     * Derive encryption key from password
     */
    private static derivePasswordEncryptionKey;
    /**
     * Encrypt data with device key
     */
    private static encryptWithDeviceKey;
    /**
     * Encrypt data with password
     */
    private static encryptWithPassword;
    /**
     * Decrypt data with device key
     */
    private static decryptWithDeviceKey;
    /**
     * Decrypt data with password
     */
    static decryptWithPassword(encryptedData: EncryptedPrivateKey, password: string): Promise<string>;
    /**
     * Store authentication data with encryption
     */
    static storeAuthData(publicKey: string, privateKey: string | null, method: string, password?: string): Promise<void>;
    /**
     * Get stored authentication data (returns encrypted private key, not decrypted)
     */
    static getStoredAuthData(): {
        publicKey: string | null;
        encryptedPrivateKey: EncryptedPrivateKey | null;
        method: string | null;
    };
    /**
     * Decrypt stored private key (requires password if password mode)
     * Automatically migrates legacy plaintext to encrypted format
     */
    static decryptStoredPrivateKey(password?: string): Promise<string | null>;
    /**
     * Check if stored private key requires password
     */
    static requiresPassword(): boolean;
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
     * Get current user's private key (decrypted)
     * Note: This will throw if password is required but not provided
     */
    static getCurrentUserPrivateKey(password?: string): Promise<string | null>;
    /**
     * Get current user's sign-in method
     */
    static getCurrentUserMethod(): string | null;
}
