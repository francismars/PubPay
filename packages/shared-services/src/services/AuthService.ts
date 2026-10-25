// AuthService - Handles authentication methods
import { nip19, getPublicKey } from 'nostr-tools';
import { Nip46Service } from './Nip46Service';
import {
  encryptWithDeviceKey,
  decryptWithDeviceKey
} from './DeviceKeyCrypto';

/**
 * PBKDF2 iteration count for password-protected private keys (OWASP 2023
 * guidance for PBKDF2-HMAC-SHA256). Stored alongside the ciphertext so the
 * count can be raised again later without breaking existing data.
 */
const PASSWORD_PBKDF2_ITERATIONS = 600000;
/** Iteration count used before `iterations` was persisted with the key. */
const LEGACY_PASSWORD_PBKDF2_ITERATIONS = 100000;

export interface AuthResult {
  success: boolean;
  publicKey?: string;
  privateKey?: string;
  method?: 'extension' | 'externalSigner' | 'nsec' | 'nip46';
  error?: string;
}

export interface EncryptedPrivateKey {
  encrypted: string;
  salt: string;
  iv: string;
  hasPassword: boolean;
  /** PBKDF2 iterations (password mode). Missing => legacy 100000. */
  iterations?: number;
}

export class AuthService {
  private static readonly METHODS = [
    'extension',
    'externalSigner',
    'nsec',
    'nip46'
  ] as const;

  // In-memory cache for decrypted private key (cleared on page reload)
  private static decryptedKeyCache: string | null = null;

  // External signer flow is clipboard-based on return; only consider it "fresh"
  // for a short window to avoid prompting users who never actually left the page.
  private static readonly EXTERNAL_SIGNER_MAX_AGE_MS = 2 * 60 * 1000;

  /**
   * Sign in with Nostr extension
   */
  static async signInWithExtension(): Promise<AuthResult> {
    try {
      if (!(window as any).nostr) {
        return {
          success: false,
          error:
            'Nostr extension not found. Please install a Nostr extension like Alby or nos2x.'
        };
      }

      const publicKey = await (window as any).nostr.getPublicKey();

      if (
        !publicKey ||
        typeof publicKey !== 'string' ||
        publicKey.length !== 64
      ) {
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
    } catch (error) {
      console.error('Extension sign in failed:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Extension sign in failed'
      };
    }
  }

  /**
   * Sign in with external signer (nostrsigner)
   */
  static async signInWithExternalSigner(): Promise<AuthResult> {
    try {
      // Store sign in data for when user returns
      sessionStorage.setItem(
        'signIn',
        JSON.stringify({ flow: 'externalSigner', initiatedAt: Date.now() })
      );

      // returnType=signature tells Amber to return via clipboard.
      window.location.href =
        'nostrsigner:?compressionType=none&returnType=signature&type=get_public_key';

      return { success: true, method: 'externalSigner' };
    } catch (error) {
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
  static async signInWithNsec(nsec: string): Promise<AuthResult> {
    try {
      if (!nsec || typeof nsec !== 'string') {
        return {
          success: false,
          error: 'No nsec provided'
        };
      }

      const { type, data } = nip19.decode(nsec);

      if (type !== 'nsec') {
        return {
          success: false,
          error: 'Invalid nsec format. Please provide a valid nsec string.'
        };
      }

      const publicKey = getPublicKey(data);

      if (
        !publicKey ||
        typeof publicKey !== 'string' ||
        publicKey.length !== 64
      ) {
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
    } catch (error) {
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
  static async handleExternalSignerReturn(): Promise<AuthResult> {
    try {
      const signInData = JSON.parse(sessionStorage.getItem('signIn') || '{}');
      // Proceed only if we previously initiated an external signer sign-in
      if (
        signInData &&
        (signInData.flow === 'externalSigner' ||
          signInData.rememberMe !== undefined)
      ) {
        // If the attempt is stale (e.g. user never left the page), don't prompt
        // for clipboard; clear state and let the UI reset.
        const initiatedAt =
          typeof signInData.initiatedAt === 'number' ? signInData.initiatedAt : 0;
        if (
          initiatedAt > 0 &&
          Date.now() - initiatedAt > this.EXTERNAL_SIGNER_MAX_AGE_MS
        ) {
          sessionStorage.removeItem('signIn');
          return {
            success: false,
            error: 'external_signer_stale'
          };
        }
        sessionStorage.removeItem('signIn');

        // Get the public key from clipboard
        const clipboardText = await this.accessClipboard();
        if (!clipboardText) {
          return {
            success: false,
            error: 'clipboard_empty'
          };
        }

        // Normalize clipboard content (can be npub, nostr:npub, or raw hex pubkey)
        const trimmed = clipboardText.trim();
        let publicKey: string | null = null;
        try {
          const clean = trimmed.replace(/^nostr:/i, '');
          if (/^npub1[0-9a-z]+$/i.test(clean)) {
            const decodedNPUB = nip19.decode(clean);
            publicKey = decodedNPUB.data as any as string;
          } else if (/^[0-9a-f]{64}$/i.test(clean)) {
            publicKey = clean.toLowerCase();
          }
        } catch (decodeError) {
          console.warn('Failed to decode public key:', decodeError);
        }

        if (
          !publicKey ||
          typeof publicKey !== 'string' ||
          publicKey.length !== 64
        ) {
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
    } catch (error) {
      console.error('External signer return failed:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to process external signer return'
      };
    }
  }

  /**
   * Access clipboard content
   */
  private static async accessClipboard(): Promise<string | null> {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        // Try multiple times to accommodate timing after app switch
        for (let i = 0; i < 10; i++) {
          try {
            const txt = await navigator.clipboard.readText();
            const val = (txt || '').trim();
            if (val) return val;
          } catch (clipboardError) {
            console.warn('Clipboard access failed:', clipboardError);
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } else {
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
          if (result && text && text.trim()) return text.trim();
        } catch (execError) {
          console.warn('execCommand paste failed:', execError);
          document.body.removeChild(textArea);
        }
      }

      // Clipboard unavailable — caller will show the paste overlay

      return null;
    } catch (error) {
      console.error('Clipboard access failed:', error);
      return null;
    }
  }

  /**
   * Derive encryption key from password
   */
  private static async derivePasswordEncryptionKey(
    password: string,
    salt: Uint8Array,
    iterations: number
  ): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    // Ensure salt is a proper BufferSource (copy to new ArrayBuffer)
    const saltArray = new Uint8Array(salt);
    const saltBuffer = saltArray.buffer;

    const encryptionKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return encryptionKey;
  }

  /**
   * Encrypt data with the per-browser device key.
   *
   * OBFUSCATION ONLY: the device key (`_dk`) is stored in localStorage next to
   * the ciphertext, so this does not protect against anything that can read
   * localStorage (XSS, malicious extensions, disk access). Password mode is
   * strongly recommended; device-key mode is kept so existing users and
   * password-less sign-ins keep working.
   */
  private static async encryptWithDeviceKey(
    data: string
  ): Promise<EncryptedPrivateKey> {
    return encryptWithDeviceKey(data);
  }

  /**
   * Encrypt data with password
   */
  private static async encryptWithPassword(
    data: string,
    password: string
  ): Promise<EncryptedPrivateKey> {
    // Generate random salt
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const encryptionKey = await this.derivePasswordEncryptionKey(
      password,
      salt,
      PASSWORD_PBKDF2_ITERATIONS
    );

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      encryptionKey,
      new TextEncoder().encode(data)
    );

    // Convert to base64
    const encryptedBase64 = btoa(
      String.fromCharCode(...new Uint8Array(encrypted))
    );
    const ivBase64 = btoa(String.fromCharCode(...iv));
    const saltBase64 = btoa(String.fromCharCode(...salt));

    return {
      encrypted: encryptedBase64,
      salt: saltBase64,
      iv: ivBase64,
      hasPassword: true,
      iterations: PASSWORD_PBKDF2_ITERATIONS
    };
  }

  /**
   * Decrypt data with the per-browser device key (obfuscation-only, see
   * encryptWithDeviceKey).
   */
  private static async decryptWithDeviceKey(
    encryptedData: EncryptedPrivateKey
  ): Promise<string> {
    return decryptWithDeviceKey(encryptedData);
  }

  /**
   * Decrypt data with password
   */
  static async decryptWithPassword(
    encryptedData: EncryptedPrivateKey,
    password: string
  ): Promise<string> {
    try {
      // Decode salt and IV from base64
      const salt = Uint8Array.from(atob(encryptedData.salt), c =>
        c.charCodeAt(0)
      );
      const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));

      // Derive encryption key from password
      const encryptionKey = await this.derivePasswordEncryptionKey(
        password,
        salt,
        encryptedData.iterations ?? LEGACY_PASSWORD_PBKDF2_ITERATIONS
      );

      // Decode encrypted data
      const encrypted = Uint8Array.from(atob(encryptedData.encrypted), c =>
        c.charCodeAt(0)
      );

      // Decrypt
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        encryptionKey,
        encrypted
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      // Provide clearer error for password decryption failures
      if (error instanceof DOMException && error.name === 'OperationError') {
        throw new Error(
          'The password you entered is incorrect. Please check your password and try again.'
        );
      }
      throw new Error(
        'Failed to decrypt with password. The password may be incorrect.'
      );
    }
  }

  /**
   * Store authentication data with encryption.
   *
   * Passing `password` (recommended) encrypts the private key with a
   * PBKDF2-derived key that is never persisted. Without a password the key is
   * only obfuscated with a device key stored in localStorage (see
   * DeviceKeyCrypto) and offers no protection against XSS or storage access.
   */
  static async storeAuthData(
    publicKey: string,
    privateKey: string | null,
    method: string,
    password?: string
  ): Promise<void> {
    // Always persist until explicit logout
    localStorage.setItem('publicKey', publicKey);
    localStorage.setItem('signInMethod', method);

    if (privateKey) {
      let encryptedData: EncryptedPrivateKey;

      if (password) {
        // Password mode: encrypt with password
        encryptedData = await this.encryptWithPassword(privateKey, password);
      } else {
        // Device-key mode (obfuscation only; password mode is recommended)
        encryptedData = await this.encryptWithDeviceKey(privateKey);
      }

      // Store encrypted private key
      localStorage.setItem('privateKey', JSON.stringify(encryptedData));
      // Also clear from sessionStorage if it exists there
      sessionStorage.removeItem('privateKey');
    } else {
      // If no private key provided, clear from storage
      localStorage.removeItem('privateKey');
      sessionStorage.removeItem('privateKey');
    }
  }

  /**
   * Clean up legacy plaintext keys from storage
   * Returns true if cleanup was performed, false otherwise
   */
  static cleanupLegacyKeys(): boolean {
    let cleaned = false;

    // Check localStorage
    const localKey = localStorage.getItem('privateKey');
    if (localKey && !localKey.startsWith('{') && !localKey.startsWith('[')) {
      localStorage.removeItem('privateKey');
      cleaned = true;
    }

    // Check sessionStorage
    const sessionKey = sessionStorage.getItem('privateKey');
    if (
      sessionKey &&
      !sessionKey.startsWith('{') &&
      !sessionKey.startsWith('[')
    ) {
      sessionStorage.removeItem('privateKey');
      cleaned = true;
    }

    return cleaned;
  }

  /**
   * Get stored authentication data (returns encrypted private key, not decrypted)
   */
  static getStoredAuthData(): {
    publicKey: string | null;
    encryptedPrivateKey: EncryptedPrivateKey | null;
    method: string | null;
  } {
    const publicKey =
      localStorage.getItem('publicKey') || sessionStorage.getItem('publicKey');
    const privateKeyStr =
      localStorage.getItem('privateKey') ||
      sessionStorage.getItem('privateKey');
    const method =
      localStorage.getItem('signInMethod') ||
      sessionStorage.getItem('signInMethod');

    let encryptedPrivateKey: EncryptedPrivateKey | null = null;
    if (privateKeyStr) {
      try {
        // Try to parse as encrypted format
        encryptedPrivateKey = JSON.parse(privateKeyStr) as EncryptedPrivateKey;
        // Validate it has the expected structure
        if (
          !encryptedPrivateKey.encrypted ||
          !encryptedPrivateKey.iv ||
          !encryptedPrivateKey.salt
        ) {
          encryptedPrivateKey = null;
        }
      } catch {
        // Invalid format - not encrypted, return null
        encryptedPrivateKey = null;
      }
    }

    return {
      publicKey,
      encryptedPrivateKey,
      method: method as any
    };
  }

  /**
   * Decrypt stored private key (requires password if password mode)
   * Uses in-memory cache for password-protected keys (cleared on page reload)
   */
  static async decryptStoredPrivateKey(
    password?: string
  ): Promise<string | null> {
    const { encryptedPrivateKey } = this.getStoredAuthData();

    if (!encryptedPrivateKey) {
      // No encrypted key found - user needs to log in again
      throw new Error(
        'Unable to decrypt your private key. Please log in again. Your key will be encrypted automatically.'
      );
    }

    try {
      if (encryptedPrivateKey.hasPassword) {
        // Password mode: check in-memory cache first
        if (this.decryptedKeyCache && !password) {
          // Use cached decrypted key if no new password provided
          return this.decryptedKeyCache;
        }

        // Password mode: require password if not cached
        if (!password && !this.decryptedKeyCache) {
          throw new Error(
            'Password is required to decrypt your private key. Please enter your password.'
          );
        }

        // Decrypt with password
        const decryptedKey = await this.decryptWithPassword(
          encryptedPrivateKey,
          password!
        );

        // Cache the decrypted key in memory for this session
        if (decryptedKey) {
          this.decryptedKeyCache = decryptedKey;

          // Transparently upgrade keys stored with the legacy (weaker) KDF
          // iteration count now that we hold both the plaintext and password.
          if (
            (encryptedPrivateKey.iterations ?? 0) <
              PASSWORD_PBKDF2_ITERATIONS &&
            localStorage.getItem('privateKey') !== null
          ) {
            try {
              const upgraded = await this.encryptWithPassword(
                decryptedKey,
                password!
              );
              localStorage.setItem('privateKey', JSON.stringify(upgraded));
              sessionStorage.removeItem('privateKey');
            } catch (upgradeError) {
              console.warn('Failed to upgrade key KDF iterations:', upgradeError);
            }
          }
        }

        return decryptedKey;
      } else {
        // Device key mode: decrypt automatically
        return await this.decryptWithDeviceKey(encryptedPrivateKey);
      }
    } catch (error) {
      console.error('Failed to decrypt private key:', error);

      // Provide clearer error messages based on error type
      if (encryptedPrivateKey.hasPassword) {
        // Password mode errors
        if (
          error instanceof Error &&
          error.message.includes('Password is required')
        ) {
          throw error; // Re-throw the original message
        }
        // Wrong password or decryption failed
        throw new Error(
          'The password you entered is incorrect. Please try again.'
        );
      } else {
        // Device key mode errors
        if (
          (error instanceof Error &&
            error.message.includes('OperationError')) ||
          (error instanceof Error && error.message.includes('decrypt'))
        ) {
          throw new Error(
            "Unable to decrypt your private key. Your browser's local storage may have been cleared. Please log in again."
          );
        }
        // Re-throw if it's already our custom error message
        if (
          error instanceof Error &&
          error.message.includes('Please log in again')
        ) {
          throw error;
        }
        throw new Error(
          'Unable to decrypt your private key. Please log in again.'
        );
      }
    }
  }

  /**
   * Check if stored private key requires password
   */
  static requiresPassword(): boolean {
    const { encryptedPrivateKey } = this.getStoredAuthData();
    return encryptedPrivateKey?.hasPassword === true;
  }

  /**
   * Clear authentication data
   */
  static clearAuthData(): void {
    localStorage.removeItem('publicKey');
    localStorage.removeItem('privateKey');
    localStorage.removeItem('signInMethod');
    Nip46Service.clearPersistedSession();
    sessionStorage.removeItem('publicKey');
    sessionStorage.removeItem('privateKey');
    sessionStorage.removeItem('signInMethod');
    sessionStorage.removeItem('signIn');
    // Clear in-memory cache
    this.decryptedKeyCache = null;
    // Note: We don't clear device key (_dk) as it's used for encryption
    // User can clear it manually if they want to reset encryption
  }

  /**
   * Validate stored authentication data
   */
  static validateStoredAuthData(): boolean {
    const { publicKey, method } = this.getStoredAuthData();

    if (
      !publicKey ||
      typeof publicKey !== 'string' ||
      publicKey.length !== 64
    ) {
      this.clearAuthData();
      return false;
    }

    if (!method || !this.METHODS.includes(method as any)) {
      this.clearAuthData();
      return false;
    }

    return true;
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated(): boolean {
    return this.validateStoredAuthData();
  }

  /**
   * Get current user's public key
   */
  static getCurrentUserPublicKey(): string | null {
    const { publicKey } = this.getStoredAuthData();
    return this.validateStoredAuthData() ? publicKey : null;
  }

  /**
   * Get current user's private key (decrypted)
   * Note: This will throw if password is required but not provided
   */
  static async getCurrentUserPrivateKey(
    password?: string
  ): Promise<string | null> {
    if (!this.validateStoredAuthData()) {
      return null;
    }
    try {
      return await this.decryptStoredPrivateKey(password);
    } catch {
      return null;
    }
  }

  /**
   * Get current user's sign-in method
   */
  static getCurrentUserMethod(): string | null {
    const { method } = this.getStoredAuthData();
    return this.validateStoredAuthData() ? method : null;
  }
}
