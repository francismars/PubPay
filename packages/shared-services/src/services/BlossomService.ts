// BlossomService - Handles blob storage on Blossom servers
import * as NostrTools from 'nostr-tools';
import { AuthService } from './AuthService';

export interface BlobDescriptor {
  hash: string;
  size: number;
  type?: string;
  uploaded_at?: number;
}

export class BlossomService {
  private serverUrl = 'https://blossom.primal.net';

  /**
   * Create SHA256 hash of a file
   */
  private async computeFileHash(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Create Nostr auth event for Blossom authentication following BUD-02 spec
   */
  private async createAuthEvent(action: 'upload' | 'delete', file?: File, hash?: string): Promise<any> {
    const storedAuth = AuthService.getStoredAuthData();
    const { privateKey, publicKey, method: signInMethod } = storedAuth;

    if (!publicKey || !signInMethod) {
      throw new Error('Not authenticated');
    }

    // Compute file hash if provided
    let fileHash: string | undefined;
    if (action === 'upload' && file) {
      fileHash = await this.computeFileHash(file);
    } else if (hash) {
      fileHash = hash;
    }

    // Calculate expiration (24 hours from now)
    const expiration = Math.floor(Date.now() / 1000) + (24 * 60 * 60);

    // Build tags according to spec
    const tags: string[][] = [
      ['t', action],
      ['expiration', expiration.toString()]
    ];

    // Add x tag with hash for upload and delete
    if (fileHash && (action === 'upload' || action === 'delete')) {
      tags.push(['x', fileHash]);
    }

    // Create descriptive content
    const content = action === 'upload' 
      ? `Upload ${file?.name || 'file'} to Blossom` 
      : `Delete ${hash} from Blossom`;

    const authEvent: any = {
      kind: 24242,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content
    };

    let signedEvent;

    // Add pubkey to event before signing
    authEvent.pubkey = publicKey;

    // Sign based on authentication method
    if (signInMethod === 'extension') {
      if (!(window as any).nostr) {
        throw new Error('Nostr extension not available');
      }
      signedEvent = await (window as any).nostr.signEvent(authEvent);
    } else if (signInMethod === 'nsec' && privateKey) {
      const { type, data } = NostrTools.nip19.decode(privateKey);
      const privateKeyBytes = data as Uint8Array;
      signedEvent = NostrTools.finalizeEvent(authEvent, privateKeyBytes);
    } else if (signInMethod === 'externalSigner') {
      // For external signer, set pubkey and hash first
      authEvent.pubkey = publicKey;
      authEvent.id = NostrTools.getEventHash(authEvent);
      
      // Store file data if uploading (need to store before redirect)
      let fileData: any = null;
      if (action === 'upload' && file) {
        // Convert file to base64 for storage
        const arrayBuffer = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        fileData = {
          name: file.name,
          type: file.type,
          size: file.size,
          data: base64
        };
      }
      
      // Store event and file data for signing
      sessionStorage.setItem('BlossomAuth', JSON.stringify({
        action,
        url: this.serverUrl,
        event: authEvent,
        file: fileData
      }));
      
      const eventString = JSON.stringify(authEvent);
      window.location.href = `nostrsigner:${eventString}?compressionType=none&returnType=signature&type=sign_event`;
      
      // This will redirect, so return a promise that never resolves
      return new Promise(() => {});
    } else {
      throw new Error('No valid signing method available');
    }

    return signedEvent;
  }

  /**
   * Upload a file to Blossom following BUD-02 spec
   */
  async uploadFile(file: File): Promise<string> {
    try {
      const authEvent = await this.createAuthEvent('upload', file);
      
      const response = await fetch(`${this.serverUrl}/upload`, {
        method: 'PUT',
        headers: {
          'Authorization': `Nostr ${btoa(JSON.stringify(authEvent))}`,
          'Content-Type': file.type || 'application/octet-stream'
        },
        body: file
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Upload failed: ${text}`);
      }

      const blob = await response.json();
      // Return the sha256 hash from the descriptor
      return blob.sha256 || blob.hash;
    } catch (error) {
      console.error('Blossom upload error:', error);
      throw new Error(`Failed to upload to Blossom: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upload a file to Blossom using provided keys (for registration flow)
   */
  async uploadFileWithKey(file: File, rawPrivateKey: Uint8Array, rawPublicKey: Uint8Array | string): Promise<string> {
    try {
      const authEvent = await this.createAuthEventWithKey(rawPrivateKey, rawPublicKey, 'upload', file);
      
      const response = await fetch(`${this.serverUrl}/upload`, {
        method: 'PUT',
        headers: {
          'Authorization': `Nostr ${btoa(JSON.stringify(authEvent))}`,
          'Content-Type': file.type || 'application/octet-stream'
        },
        body: file
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Upload failed: ${text}`);
      }

      const blob = await response.json();
      return blob.sha256 || blob.hash;
    } catch (error) {
      console.error('Blossom upload error:', error);
      throw new Error(`Failed to upload to Blossom: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Complete upload after external signer returns (called from visibilitychange handler)
   */
  static async completeExternalSignerUpload(signature: string): Promise<string | null> {
    try {
      const blossomData = sessionStorage.getItem('BlossomAuth');
      if (!blossomData) {
        console.warn('No BlossomAuth data found in sessionStorage');
        return null;
      }

      const { action, url, event, file } = JSON.parse(blossomData);
      
      if (action !== 'upload' || !file) {
        console.warn('Invalid BlossomAuth data:', { action, hasFile: !!file });
        sessionStorage.removeItem('BlossomAuth');
        return null;
      }

      // Finalize event with signature
      const signedEvent = { ...event, sig: signature };
      
      // Verify the signed event
      const isValid = NostrTools.verifyEvent(signedEvent);
      if (!isValid) {
        console.error('Invalid signed event signature');
        sessionStorage.removeItem('BlossomAuth');
        throw new Error('Invalid event signature');
      }

      console.log('Verifying signed event, reconstructing file...');
      
      // Reconstruct file from base64
      try {
        console.log('Decoding base64, length:', file.data.length);
        const binaryString = atob(file.data);
        console.log('Base64 decoded, binary string length:', binaryString.length);
        
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: file.type });
        const reconstructedFile = new File([blob], file.name, { type: file.type });
        console.log('File reconstructed, size:', reconstructedFile.size, 'type:', file.type);

        // Complete upload with timeout
        console.log('Starting upload to:', `${url}/upload`);
        const uploadPromise = fetch(`${url}/upload`, {
          method: 'PUT',
          headers: {
            'Authorization': `Nostr ${btoa(JSON.stringify(signedEvent))}`,
            'Content-Type': file.type || 'application/octet-stream'
          },
          body: reconstructedFile
        });

        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Upload timeout after 60 seconds')), 60000)
        );

        const response = await Promise.race([uploadPromise, timeoutPromise]);
        console.log('Upload response status:', response.status);

        if (!response.ok) {
          const text = await response.text();
          console.error('Upload failed with response:', text);
          throw new Error(`Upload failed: ${text}`);
        }

        const result = await response.json();
        console.log('Upload successful, result:', result);
        sessionStorage.removeItem('BlossomAuth');
        
        // Return the file URL
        const hash = result.sha256 || result.hash;
        if (!hash) {
          throw new Error('No hash returned from upload');
        }
        return `${url}/${hash}`;
      } catch (fileError) {
        console.error('Error reconstructing file or uploading:', fileError);
        sessionStorage.removeItem('BlossomAuth');
        throw fileError;
      }
    } catch (error) {
      console.error('Blossom external signer upload error:', error);
      sessionStorage.removeItem('BlossomAuth');
      throw error;
    }
  }

  /**
   * Create auth event with specific keys (for registration)
   */
  private async createAuthEventWithKey(
    rawPrivateKey: Uint8Array,
    rawPublicKey: Uint8Array | string,
    action: 'upload' | 'delete',
    file?: File,
    hash?: string
  ): Promise<any> {
    // Compute file hash if provided
    let fileHash: string | undefined;
    if (action === 'upload' && file) {
      fileHash = await this.computeFileHash(file);
    } else if (hash) {
      fileHash = hash;
    }

    // Calculate expiration (24 hours from now)
    const expiration = Math.floor(Date.now() / 1000) + (24 * 60 * 60);

    // Build tags according to spec
    const tags: string[][] = [
      ['t', action],
      ['expiration', expiration.toString()]
    ];

    // Add x tag with hash for upload and delete
    if (fileHash) {
      tags.push(['x', fileHash]);
    }

    // Create descriptive content
    const content = action === 'upload' 
      ? `Upload ${file?.name || 'file'} to Blossom` 
      : `Delete ${hash} from Blossom`;

    // Convert public key to hex if needed
    let pubkey: string;
    if (typeof rawPublicKey === 'string') {
      pubkey = rawPublicKey;
    } else {
      pubkey = Array.from(rawPublicKey)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }

    const authEvent: any = {
      kind: 24242,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
      pubkey
    };

    // Sign with the provided private key
    const signedEvent = NostrTools.finalizeEvent(authEvent, rawPrivateKey);

    return signedEvent;
  }

  /**
   * Download a file from Blossom by hash
   */
  async downloadFile(hash: string): Promise<Blob> {
    const response = await fetch(`${this.serverUrl}/${hash}`);
    if (!response.ok) throw new Error('Download failed');
    return await response.blob();
  }

  /**
   * Get file URL (for displaying in img tags, etc)
   */
  getFileUrl(hash: string): string {
    return `${this.serverUrl}/${hash}`;
  }

  /**
   * Check if a file exists on the server
   */
  async fileExists(hash: string): Promise<boolean> {
    const response = await fetch(`${this.serverUrl}/${hash}`, {
      method: 'HEAD'
    });
    return response.ok;
  }

  /**
   * List user's uploaded blobs
   */
  async listUserBlobs(): Promise<BlobDescriptor[]> {
    const publicKey = AuthService.getCurrentUserPublicKey();
    if (!publicKey) throw new Error('Not authenticated');

    const response = await fetch(`${this.serverUrl}/list/${publicKey}`);
    if (!response.ok) throw new Error('List failed');
    
    return await response.json();
  }

  /**
   * Delete a blob following BUD-02 spec
   */
  async deleteBlob(hash: string): Promise<void> {
    const authEvent = await this.createAuthEvent('delete', undefined, hash);
    
    const response = await fetch(`${this.serverUrl}/${hash}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Nostr ${btoa(JSON.stringify(authEvent))}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Delete failed: ${text}`);
    }
  }

  /**
   * Upload an image from clipboard/paste event
   */
  async uploadImageFromClipboard(file: File): Promise<string> {
    // Only accept image files
    if (!file.type.startsWith('image/')) {
      throw new Error('File must be an image');
    }

    return this.uploadFile(file);
  }

  /**
   * Check if user is authenticated (required for uploads)
   */
  isAuthenticated(): boolean {
    return AuthService.isAuthenticated();
  }
}
