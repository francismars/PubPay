/**
 * LightningAddressService - Handles Lightning Address operations
 * Supports format validation, LNURL discovery, and invoice fetching
 */

export interface LightningAddressValidationResult {
  valid: boolean;
  error?: string;
}

export interface ParsedLightningAddress {
  username: string;
  domain: string;
}

export interface LNURLPayInfo {
  callback: string;
  minSendable?: number;
  maxSendable?: number;
  metadata?: string;
  allowsNostr?: boolean;
  commentAllowed?: number;
}

export class LightningAddressService {
  /**
   * Parse a Lightning Address into username and domain
   */
  static parseAddress(address: string): ParsedLightningAddress | null {
    const trimmed = address.trim();
    const parts = trimmed.split('@');
    if (parts.length !== 2) {
      return null;
    }
    return {
      username: parts[0],
      domain: parts[1]
    };
  }

  /**
   * Validate Lightning Address format
   */
  static validateFormat(address: string): LightningAddressValidationResult {
    const trimmed = address.trim();

    if (!trimmed) {
      return { valid: false, error: 'Lightning Address is required' };
    }

    // Check format: must have exactly one @
    const addressParts = trimmed.split('@');
    if (addressParts.length !== 2) {
      return { valid: false, error: 'Invalid format. Must be: user@domain.com' };
    }

    const [username, domain] = addressParts;

    // Validate username
    if (!username || username.length === 0) {
      return { valid: false, error: 'Username cannot be empty' };
    }

    if (username.length > 64) {
      return { valid: false, error: 'Username is too long (max 64 characters)' };
    }

    // Validate domain
    if (!domain || domain.length === 0) {
      return { valid: false, error: 'Domain cannot be empty' };
    }

    // Basic domain format check
    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i;
    if (!domainRegex.test(domain)) {
      return { valid: false, error: 'Invalid domain format' };
    }

    return { valid: true };
  }

  /**
   * Discover LNURL-pay endpoint from Lightning Address
   */
  static async discoverLNURL(
    address: string,
    options: { timeout?: number } = {}
  ): Promise<LNURLPayInfo> {
    const timeout = options.timeout || 10000;
    const parsed = this.parseAddress(address);
    
    if (!parsed) {
      throw new Error('Invalid Lightning Address format');
    }

    const discoveryUrl = `https://${parsed.domain}/.well-known/lnurlp/${parsed.username}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    try {
      response = await fetch(discoveryUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error('Request timed out. The domain may be unreachable or slow to respond.');
      }
      throw new Error('Failed to connect to domain. Check your internet connection.');
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Lightning Address not found. This address may not exist or the domain does not support Lightning Addresses.');
      } else if (response.status === 500) {
        throw new Error('Server error. The domain may be experiencing issues.');
      } else {
        throw new Error(`Failed to discover Lightning Address (HTTP ${response.status})`);
      }
    }

    const lnurlInfo = await response.json();

    if (!lnurlInfo.callback) {
      throw new Error('This Lightning Address does not support payments (no callback URL found)');
    }

    return lnurlInfo as LNURLPayInfo;
  }

  /**
   * Fetch invoice from Lightning Address
   */
  static async fetchInvoice(
    address: string,
    amount: number,
    options: {
      description?: string;
      timeout?: number;
    } = {}
  ): Promise<string> {
    const { description, timeout = 10000 } = options;

    // Validate inputs
    if (!address || !address.trim()) {
      throw new Error('Lightning Address is required');
    }

    if (isNaN(amount) || amount <= 0) {
      throw new Error('Please enter a valid amount (must be greater than 0)');
    }

    // Validate format
    const validation = this.validateFormat(address);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid Lightning Address');
    }

    // Step 1: Discover LNURL-pay endpoint
    const lnurlInfo = await this.discoverLNURL(address, { timeout });

    // Check min/max amounts if provided
    if (lnurlInfo.minSendable && amount * 1000 < lnurlInfo.minSendable) {
      const minSats = Math.ceil(lnurlInfo.minSendable / 1000);
      throw new Error(`Amount too low. Minimum: ${minSats} sats`);
    }

    if (lnurlInfo.maxSendable && amount * 1000 > lnurlInfo.maxSendable) {
      const maxSats = Math.floor(lnurlInfo.maxSendable / 1000);
      throw new Error(`Amount too high. Maximum: ${maxSats} sats`);
    }

    // Step 2: Request invoice from callback
    const amountMillisats = amount * 1000;
    const callbackUrl = new URL(lnurlInfo.callback);
    callbackUrl.searchParams.set('amount', amountMillisats.toString());

    if (description && description.trim()) {
      callbackUrl.searchParams.set('comment', description.trim());
    }

    const invoiceController = new AbortController();
    const invoiceTimeoutId = setTimeout(() => invoiceController.abort(), timeout);

    let invoiceResponse: Response;
    try {
      invoiceResponse = await fetch(callbackUrl.toString(), {
        signal: invoiceController.signal,
        headers: {
          'Accept': 'application/json'
        }
      });
      clearTimeout(invoiceTimeoutId);
    } catch (fetchError) {
      clearTimeout(invoiceTimeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error('Invoice request timed out. Please try again.');
      }
      throw new Error('Failed to request invoice. Please try again.');
    }

    if (!invoiceResponse.ok) {
      const errorData = await invoiceResponse.json().catch(() => ({}));
      if (errorData.reason) {
        throw new Error(errorData.reason);
      }
      throw new Error(`Failed to get invoice (HTTP ${invoiceResponse.status})`);
    }

    const invoiceData = await invoiceResponse.json();

    if (!invoiceData.pr) {
      throw new Error(invoiceData.reason || 'No invoice returned from server');
    }

    return invoiceData.pr;
  }
}



