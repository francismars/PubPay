// AuthService - Handles authentication methods
import * as NostrTools from 'nostr-tools';

export interface AuthResult {
  success: boolean;
  publicKey?: string;
  privateKey?: string;
  method?: 'extension' | 'externalSigner' | 'nsec';
  error?: string;
}

export class AuthService {
  private static readonly METHODS = [
    'extension',
    'externalSigner',
    'nsec'
  ] as const;

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
  static async signInWithExternalSigner(
    rememberMe: boolean = false
  ): Promise<AuthResult> {
    try {
      // Store sign in data for when user returns
      sessionStorage.setItem('signIn', JSON.stringify({ rememberMe }));

      // Navigate to external signer
      const nostrSignerURL =
        'nostrsigner:?compressionType=none&returnType=signature&type=get_public_key';

      // Set up visibility change listener to detect when external signer opens
      const navigationAttempted = await new Promise<boolean>(resolve => {
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
          document.removeEventListener(
            'visibilitychange',
            handleVisibilityChange
          );
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

      const { type, data } = NostrTools.nip19.decode(nsec);

      if (type !== 'nsec') {
        return {
          success: false,
          error: 'Invalid nsec format. Please provide a valid nsec string.'
        };
      }

      const publicKey = NostrTools.getPublicKey(data);

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
      if (signInData && signInData.rememberMe !== undefined) {
        sessionStorage.removeItem('signIn');

        // Get the public key from clipboard
        const clipboardText = await this.accessClipboard();
        if (!clipboardText) {
          return {
            success: false,
            error: 'No public key found in clipboard'
          };
        }

        // Normalize clipboard content (can be npub, nostr:npub, or raw hex pubkey)
        const trimmed = clipboardText.trim();
        let publicKey: string | null = null;
        try {
          const clean = trimmed.replace(/^nostr:/i, '');
          if (/^npub1[0-9a-z]+$/i.test(clean)) {
            const decodedNPUB = NostrTools.nip19.decode(clean);
            publicKey = (decodedNPUB.data as any) as string;
          } else if (/^[0-9a-f]{64}$/i.test(clean)) {
            publicKey = clean.toLowerCase();
          }
        } catch {}

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
        return await navigator.clipboard.readText();
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
          return result ? text : null;
        } catch (err) {
          document.body.removeChild(textArea);
          return null;
        }
      }
    } catch (error) {
      console.error('Clipboard access failed:', error);
      return null;
    }
  }

  /**
   * Store authentication data
   */
  static storeAuthData(
    publicKey: string,
    privateKey: string | null,
    method: string,
    rememberMe: boolean
  ): void {
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
  static getStoredAuthData(): {
    publicKey: string | null;
    privateKey: string | null;
    method: string | null;
  } {
    const publicKey =
      localStorage.getItem('publicKey') || sessionStorage.getItem('publicKey');
    const privateKey =
      localStorage.getItem('privateKey') ||
      sessionStorage.getItem('privateKey');
    const method =
      localStorage.getItem('signInMethod') ||
      sessionStorage.getItem('signInMethod');

    return {
      publicKey,
      privateKey,
      method: method as any
    };
  }

  /**
   * Clear authentication data
   */
  static clearAuthData(): void {
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
   * Get current user's private key
   */
  static getCurrentUserPrivateKey(): string | null {
    const { privateKey } = this.getStoredAuthData();
    return this.validateStoredAuthData() ? privateKey : null;
  }

  /**
   * Get current user's sign-in method
   */
  static getCurrentUserMethod(): string | null {
    const { method } = this.getStoredAuthData();
    return this.validateStoredAuthData() ? method : null;
  }
}
