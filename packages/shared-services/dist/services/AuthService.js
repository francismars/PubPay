// AuthService - Handles authentication methods
import * as NostrTools from 'nostr-tools';
export class AuthService {
    /**
     * Sign in with Nostr extension
     */
    static async signInWithExtension() {
        try {
            if (!window.nostr) {
                return {
                    success: false,
                    error: 'Nostr extension not found. Please install a Nostr extension like Alby or nos2x.'
                };
            }
            const publicKey = await window.nostr.getPublicKey();
            if (!publicKey ||
                typeof publicKey !== 'string' ||
                publicKey.length !== 64) {
                return {
                    success: false,
                    error: 'Invalid public key received from extension'
                };
            }
            return {
                success: true,
                publicKey,
                method: 'extension'
            };
        }
        catch (error) {
            console.error('Extension sign in failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Extension sign in failed'
            };
        }
    }
    /**
     * Sign in with external signer (nostrsigner)
     */
    static async signInWithExternalSigner(rememberMe = false) {
        try {
            // Store sign in data for when user returns
            sessionStorage.setItem('signIn', JSON.stringify({ rememberMe }));
            // Navigate to external signer
            const nostrSignerURL = 'nostrsigner:?compressionType=none&returnType=signature&type=get_public_key';
            // Set up visibility change listener to detect when external signer opens
            const navigationAttempted = await new Promise(resolve => {
                let attempted = false;
                const handleVisibilityChange = () => {
                    if (document.visibilityState === 'hidden') {
                        attempted = true;
                        resolve(true);
                    }
                };
                document.addEventListener('visibilitychange', handleVisibilityChange);
                window.location.href = nostrSignerURL;
                // Timeout after 3 seconds if no navigation occurs
                setTimeout(() => {
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
                    resolve(false);
                }, 3000);
            });
            if (!navigationAttempted) {
                sessionStorage.removeItem('signIn');
                return {
                    success: false,
                    error: "Failed to launch 'nostrsigner': Redirection did not occur."
                };
            }
            // This will redirect, so we return a pending state
            return {
                success: true,
                method: 'externalSigner'
            };
        }
        catch (error) {
            console.error('External signer failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'External signer failed'
            };
        }
    }
    /**
     * Sign in with nsec (private key)
     */
    static async signInWithNsec(nsec) {
        try {
            if (!nsec || typeof nsec !== 'string') {
                return {
                    success: false,
                    error: 'No nsec provided'
                };
            }
            const { type, data } = NostrTools.nip19.decode(nsec);
            if (type !== 'nsec') {
                return {
                    success: false,
                    error: 'Invalid nsec format. Please provide a valid nsec string.'
                };
            }
            const publicKey = NostrTools.getPublicKey(data);
            if (!publicKey ||
                typeof publicKey !== 'string' ||
                publicKey.length !== 64) {
                return {
                    success: false,
                    error: 'Failed to derive public key from nsec'
                };
            }
            return {
                success: true,
                publicKey,
                privateKey: nsec,
                method: 'nsec'
            };
        }
        catch (error) {
            console.error('Nsec sign in failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Invalid nsec'
            };
        }
    }
    /**
     * Handle external signer return
     */
    static async handleExternalSignerReturn() {
        try {
            const signInData = JSON.parse(sessionStorage.getItem('signIn') || '{}');
            if (!signInData.rememberMe !== undefined) {
                sessionStorage.removeItem('signIn');
                // Get the public key from clipboard
                const npub = await this.accessClipboard();
                if (!npub) {
                    return {
                        success: false,
                        error: 'No public key found in clipboard'
                    };
                }
                const decodedNPUB = NostrTools.nip19.decode(npub);
                const publicKey = decodedNPUB.data;
                if (!publicKey ||
                    typeof publicKey !== 'string' ||
                    publicKey.length !== 64) {
                    return {
                        success: false,
                        error: 'Invalid public key from clipboard'
                    };
                }
                return {
                    success: true,
                    publicKey,
                    method: 'externalSigner'
                };
            }
            return {
                success: false,
                error: 'No external signer data found'
            };
        }
        catch (error) {
            console.error('External signer return failed:', error);
            return {
                success: false,
                error: error instanceof Error
                    ? error.message
                    : 'Failed to process external signer return'
            };
        }
    }
    /**
     * Access clipboard content
     */
    static async accessClipboard() {
        try {
            if (navigator.clipboard && navigator.clipboard.readText) {
                return await navigator.clipboard.readText();
            }
            else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    const result = document.execCommand('paste');
                    const text = textArea.value;
                    document.body.removeChild(textArea);
                    return result ? text : null;
                }
                catch (err) {
                    document.body.removeChild(textArea);
                    return null;
                }
            }
        }
        catch (error) {
            console.error('Clipboard access failed:', error);
            return null;
        }
    }
    /**
     * Store authentication data
     */
    static storeAuthData(publicKey, privateKey, method, rememberMe) {
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem('publicKey', publicKey);
        storage.setItem('signInMethod', method);
        if (privateKey) {
            storage.setItem('privateKey', privateKey);
        }
    }
    /**
     * Get stored authentication data
     */
    static getStoredAuthData() {
        const publicKey = localStorage.getItem('publicKey') || sessionStorage.getItem('publicKey');
        const privateKey = localStorage.getItem('privateKey') ||
            sessionStorage.getItem('privateKey');
        const method = localStorage.getItem('signInMethod') ||
            sessionStorage.getItem('signInMethod');
        return {
            publicKey,
            privateKey,
            method: method
        };
    }
    /**
     * Clear authentication data
     */
    static clearAuthData() {
        localStorage.removeItem('publicKey');
        localStorage.removeItem('privateKey');
        localStorage.removeItem('signInMethod');
        sessionStorage.removeItem('publicKey');
        sessionStorage.removeItem('privateKey');
        sessionStorage.removeItem('signInMethod');
        sessionStorage.removeItem('signIn');
    }
    /**
     * Validate stored authentication data
     */
    static validateStoredAuthData() {
        const { publicKey, method } = this.getStoredAuthData();
        if (!publicKey ||
            typeof publicKey !== 'string' ||
            publicKey.length !== 64) {
            this.clearAuthData();
            return false;
        }
        if (!method || !this.METHODS.includes(method)) {
            this.clearAuthData();
            return false;
        }
        return true;
    }
    /**
     * Check if user is authenticated
     */
    static isAuthenticated() {
        return this.validateStoredAuthData();
    }
    /**
     * Get current user's public key
     */
    static getCurrentUserPublicKey() {
        const { publicKey } = this.getStoredAuthData();
        return this.validateStoredAuthData() ? publicKey : null;
    }
    /**
     * Get current user's private key
     */
    static getCurrentUserPrivateKey() {
        const { privateKey } = this.getStoredAuthData();
        return this.validateStoredAuthData() ? privateKey : null;
    }
    /**
     * Get current user's sign-in method
     */
    static getCurrentUserMethod() {
        const { method } = this.getStoredAuthData();
        return this.validateStoredAuthData() ? method : null;
    }
}
AuthService.METHODS = [
    'extension',
    'externalSigner',
    'nsec'
];
