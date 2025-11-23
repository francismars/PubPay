import { nip04, nip19, utils, finalizeEvent, getPublicKey, SimplePool } from 'nostr-tools';

type NwcUri = {
  walletPubkey: string;
  relays: string[];
  clientSecretHex: string;
  clientPubkey: string;
};

type RpcRequest = {
  method: string;
  params: Record<string, unknown>;
};

type RpcResponse<T = unknown> = {
  result_type: string;
  result: T | null;
  error: { code: string; message: string } | null;
};

export class NwcClient {
  private uri: NwcUri;
  private pool: SimplePool;

  static STORAGE_KEY = 'nwcConnectionString';

  constructor(connectionString: string) {
    this.uri = this.parseConnectionString(connectionString);
    this.pool = new SimplePool();
  }

  async getInfo(): Promise<{
    methods: string[];
    notifications?: string[];
    encryption?: string[];
  } | null> {
    try {
      const filter = {
        kinds: [13194],
        authors: [this.uri.walletPubkey]
      } as any;
      
      // Add timeout to get() call
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 10000); // 10 second timeout
      });
      
      const getPromise = (this.pool as any).get(this.uri.relays, filter);
      const evt = await Promise.race([getPromise, timeoutPromise]);
      
      if (!evt) return null;
      const content: string = evt.content || '';
      const methods = content.trim() ? content.trim().split(/\s+/) : [];
      const tags: string[][] = evt.tags || [];
      const notificationsTag = tags.find(t => t[0] === 'notifications');
      const encryptionTag = tags.find(t => t[0] === 'encryption');
      const notifications =
        notificationsTag && notificationsTag[1]
          ? notificationsTag[1].split(/\s+/)
          : undefined;
      const encryption =
        encryptionTag && encryptionTag[1]
          ? encryptionTag[1].split(/\s+/)
          : undefined;
      return { methods, notifications, encryption };
    } catch (error) {
      console.error('Failed to get NWC info:', error);
      return null;
    }
  }

  static async validate(connectionString: string): Promise<boolean> {
    try {
      const client = new NwcClient(connectionString);
      const info = await client.getInfo();
      return !!info && (info.methods?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }

  static fromSaved(): NwcClient | null {
    const saved =
      (typeof localStorage !== 'undefined' &&
        localStorage.getItem(NwcClient.STORAGE_KEY)) ||
      (typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem(NwcClient.STORAGE_KEY));
    if (!saved) return null;
    try {
      return new NwcClient(saved);
    } catch {
      return null;
    }
  }

  async payInvoice(
    invoice: string
  ): Promise<RpcResponse<{ preimage: string; fees_paid?: number }>> {
    const request: RpcRequest = {
      method: 'pay_invoice',
      params: { invoice }
    };
    return await this.sendRequest<{ preimage: string; fees_paid?: number }>(
      request
    );
  }

  async getBalance(): Promise<RpcResponse<{ balance: number }>> {
    const request: RpcRequest = {
      method: 'get_balance',
      params: {}
    };
    return await this.sendRequest<{ balance: number }>(request);
  }

  async makeInvoice(params: {
    amount?: number;
    description?: string;
    description_hash?: string;
    expiry?: number;
  }): Promise<RpcResponse<{ invoice: string; payment_hash: string }>> {
    const request: RpcRequest = {
      method: 'make_invoice',
      params
    };
    return await this.sendRequest<{ invoice: string; payment_hash: string }>(
      request
    );
  }

  async listInvoices(params?: {
    limit?: number;
    offset?: number;
    pending?: boolean;
  }): Promise<
    RpcResponse<{
      invoices: Array<{
        invoice: string;
        payment_hash: string;
        preimage?: string;
        payment_index?: number;
        amount?: number;
        paid_at?: number;
        description?: string;
        description_hash?: string;
        expiry?: number;
        created_at?: number;
      }>;
    }>
  > {
    const request: RpcRequest = {
      method: 'list_invoices',
      params: params || {}
    };
    return await this.sendRequest<{
      invoices: Array<{
        invoice: string;
        payment_hash: string;
        preimage?: string;
        payment_index?: number;
        amount?: number;
        paid_at?: number;
        description?: string;
        description_hash?: string;
        expiry?: number;
        created_at?: number;
      }>;
    }>(request);
  }

  async lookupInvoice(
    paymentHash: string
  ): Promise<
    RpcResponse<{
      invoice: string;
      payment_hash: string;
      preimage?: string;
      payment_index?: number;
      amount?: number;
      paid_at?: number;
      description?: string;
      description_hash?: string;
      expiry?: number;
      created_at?: number;
    }>
  > {
    const request: RpcRequest = {
      method: 'lookup_invoice',
      params: { payment_hash: paymentHash }
    };
    return await this.sendRequest<{
      invoice: string;
      payment_hash: string;
      preimage?: string;
      payment_index?: number;
      amount?: number;
      paid_at?: number;
      description?: string;
      description_hash?: string;
      expiry?: number;
      created_at?: number;
    }>(request);
  }

  private async sendRequest<T = unknown>(
    request: RpcRequest,
    timeoutMs: number = 60000
  ): Promise<RpcResponse<T>> {
    const now = Math.floor(Date.now() / 1000);
    const contentJson = JSON.stringify(request);

    // Use nip04 encryption for compatibility
    const ciphertext = await nip04.encrypt(
      this.uri.clientSecretHex,
      this.uri.walletPubkey,
      contentJson
    );

    // Build request event kind 23194
    const eventTemplate: Record<string, unknown> = {
      kind: 23194,
      created_at: now,
      content: ciphertext,
      tags: [
        ['p', this.uri.walletPubkey],
        ['encryption', 'nip04']
      ]
    };

    const skBytes = utils.hexToBytes(this.uri.clientSecretHex);
    const requestEvent = finalizeEvent(
      eventTemplate as any,
      skBytes
    );

    // Publish
    try {
      await (this.pool as any).publish(this.uri.relays, requestEvent);
    } catch (error) {
      return {
        result_type: 'error',
        result: null,
        error: {
          code: 'publish_failed',
          message: error instanceof Error ? error.message : 'Failed to publish request'
        }
      };
    }

    // Subscribe for response 23195 from wallet, tagged back to our request
    const filter = {
      kinds: [23195],
      authors: [this.uri.walletPubkey],
      '#p': [this.uri.clientPubkey],
      '#e': [requestEvent.id]
    } as Record<string, unknown>;

    let sub: any = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let resolved = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (sub && typeof sub.close === 'function') {
        try {
          sub.close();
        } catch (e) {
          // Ignore cleanup errors
        }
        sub = null;
      }
    };

    const response = await new Promise<RpcResponse<T>>((resolve, reject) => {
      try {
        sub = (this.pool as any).subscribe(this.uri.relays, filter, {
          onevent: async (evt: any) => {
            if (resolved) return;
            try {
              const plaintext = await nip04.decrypt(
                this.uri.clientSecretHex,
                this.uri.walletPubkey,
                evt.content
              );
              const parsed = JSON.parse(plaintext) as RpcResponse<T>;
              resolved = true;
              cleanup();
              resolve(parsed);
            } catch (err) {
              // Ignore malformed events and continue listening
              console.debug('Failed to decrypt/parse NWC response:', err);
            }
          },
          oneose: () => {
            // End of stored events - continue waiting for new events
            // Don't resolve here, wait for actual response or timeout
          },
          onclose: () => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve({
              result_type: 'error',
              result: null,
              error: {
                code: 'subscription_closed',
                message: 'Subscription closed before receiving response'
              }
            });
          }
        });

        // Set up timeout
        timeoutId = setTimeout(() => {
          if (resolved) return;
          resolved = true;
          cleanup();
          resolve({
            result_type: 'error',
            result: null,
            error: {
              code: 'timeout',
              message: 'Request timed out waiting for wallet response'
            }
          });
        }, timeoutMs);
      } catch (error) {
        resolved = true;
        cleanup();
        resolve({
          result_type: 'error',
          result: null,
          error: {
            code: 'subscription_setup_failed',
            message: error instanceof Error ? error.message : 'Failed to set up subscription'
          }
        });
      }
    });

    // Ensure cleanup in case promise resolves/rejects unexpectedly
    cleanup();
    return response;
  }

  private parseConnectionString(connectionString: string): NwcUri {
    // Support: nostr+walletconnect:// and nostrnwc:// schemes
    const normalized = connectionString
      .replace(/^nostr\+walletconnect:\/\//i, 'https://')
      .replace(/^nostrnwc:\/\//i, 'https://');

    // Split pubkey and query safely
    const url = new URL(normalized);
    // For https://<pubkey>?..., the pubkey is in hostname; for https://host/<pubkey>, it's in pathname
    const candidateFromHost = (url.hostname || '').trim();
    const candidateFromPath = (url.pathname || '').replace(/^\/+/, '').trim();
    const walletPubkey = candidateFromHost || candidateFromPath;

    // Collect relays: multiple relay params and comma-separated lists
    const relayParams = url.searchParams.getAll('relay');
    const relays: string[] = [];
    for (const rp of relayParams) {
      const decoded = decodeURIComponent(rp);
      decoded
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(r => relays.push(r));
    }

    // Read secret; accept hex or nsec; normalize to hex
    let secret = url.searchParams.get('secret') || '';
    secret = secret.trim();
    let clientSecretHex: string;
    if (secret.startsWith('nsec')) {
      const decoded = nip19.decode(secret).data as Uint8Array;
      clientSecretHex = utils.bytesToHex(decoded);
    } else {
      clientSecretHex = secret;
    }

    if (!walletPubkey || !clientSecretHex || relays.length === 0) {
      throw new Error('Invalid NWC connection string');
    }

    const clientPubkey = getPublicKey(
      utils.hexToBytes(clientSecretHex)
    );
    return { walletPubkey, relays, clientSecretHex, clientPubkey };
  }
}
