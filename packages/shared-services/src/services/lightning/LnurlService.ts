/**
 * LNURLService - Handles LNURL operations
 * Supports bech32 decoding, LNURL-pay discovery, and invoice fetching
 */

import { bech32 } from 'bech32';
import type { LNURLPayInfo } from './LightningAddressService';

export interface LNURLPayResponse {
  pr: string; // BOLT11 invoice
  routes?: any[];
  disposable?: boolean;
  successAction?: any;
}

export class LnurlService {
  /**
   * Decode bech32 LNURL string to URL
   * @param lnurl - LNURL string (e.g., "lnurl1..." or "lightning:lnurl1...")
   * @returns Decoded URL or null if invalid
   */
  static decodeLnurl(lnurl: string): string | null {
    try {
      const trimmed = lnurl.trim().toLowerCase();
      
      // Remove "lightning:" protocol prefix if present
      const cleanLnurl = trimmed.startsWith('lightning:') 
        ? trimmed.substring(10) 
        : trimmed;
      
      // Check if it starts with lnurl1
      if (!cleanLnurl.startsWith('lnurl1')) {
        return null;
      }

      // Decode bech32
      const decoded = bech32.decode(cleanLnurl, 2000);
      const words = bech32.fromWords(decoded.words);
      // Convert words to Uint8Array and then to string
      const bytes = new Uint8Array(words);
      const url = new TextDecoder().decode(bytes);
      
      return url;
    } catch (error) {
      console.error('Failed to decode LNURL:', error);
      return null;
    }
  }

  /**
   * Check if a string is a valid LNURL format
   * @param input - Input string to check
   * @returns true if it's a valid LNURL format
   */
  static isLnurl(input: string): boolean {
    const trimmed = input.trim().toLowerCase();
    const cleanInput = trimmed.startsWith('lightning:') 
      ? trimmed.substring(10) 
      : trimmed;
    return cleanInput.startsWith('lnurl1');
  }

  /**
   * Discover LNURL-pay endpoint from decoded URL
   * @param url - Decoded LNURL URL
   * @param options - Options including timeout
   * @returns LNURL-pay info
   */
  static async discoverLNURLPay(
    url: string,
    options: { timeout?: number } = {}
  ): Promise<LNURLPayInfo> {
    const timeout = options.timeout || 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error('Request timed out. The LNURL endpoint may be unreachable or slow to respond.');
      }
      throw new Error('Failed to connect to LNURL endpoint. Check your internet connection.');
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('LNURL endpoint not found.');
      } else if (response.status === 500) {
        throw new Error('Server error. The LNURL endpoint may be experiencing issues.');
      } else {
        throw new Error(`Failed to discover LNURL (HTTP ${response.status})`);
      }
    }

    const lnurlInfo = await response.json();

    // Check if it's an error response
    if (lnurlInfo.status === 'ERROR') {
      throw new Error(lnurlInfo.reason || 'LNURL endpoint returned an error');
    }

    if (!lnurlInfo.callback) {
      throw new Error('This LNURL does not support payments (no callback URL found)');
    }

    return lnurlInfo as LNURLPayInfo;
  }

  /**
   * Fetch invoice from LNURL-pay endpoint
   * @param lnurl - LNURL string (bech32 encoded)
   * @param amount - Amount in satoshis
   * @param options - Options including description and timeout
   * @returns BOLT11 invoice
   */
  static async fetchInvoice(
    lnurl: string,
    amount: number,
    options: {
      description?: string;
      timeout?: number;
    } = {}
  ): Promise<string> {
    const { description, timeout = 10000 } = options;

    // Validate inputs
    if (!lnurl || !lnurl.trim()) {
      throw new Error('LNURL is required');
    }

    if (isNaN(amount) || amount <= 0) {
      throw new Error('Please enter a valid amount (must be greater than 0)');
    }

    // Step 1: Decode LNURL to URL
    const url = this.decodeLnurl(lnurl);
    if (!url) {
      throw new Error('Invalid LNURL format. Must be a bech32 encoded lnurl1... string.');
    }

    // Step 2: Discover LNURL-pay endpoint
    const lnurlInfo = await this.discoverLNURLPay(url, { timeout });

    // Check min/max amounts if provided
    if (lnurlInfo.minSendable && amount * 1000 < lnurlInfo.minSendable) {
      const minSats = Math.ceil(lnurlInfo.minSendable / 1000);
      throw new Error(`Amount too low. Minimum: ${minSats} sats`);
    }

    if (lnurlInfo.maxSendable && amount * 1000 > lnurlInfo.maxSendable) {
      const maxSats = Math.floor(lnurlInfo.maxSendable / 1000);
      throw new Error(`Amount too high. Maximum: ${maxSats} sats`);
    }

    // Step 3: Request invoice from callback
    const amountMillisats = amount * 1000;
    const callbackUrl = new URL(lnurlInfo.callback);
    callbackUrl.searchParams.set('amount', amountMillisats.toString());

    if (description && description.trim()) {
      // Check if comments are allowed
      if (lnurlInfo.commentAllowed && description.trim().length > lnurlInfo.commentAllowed) {
        throw new Error(`Description too long. Maximum: ${lnurlInfo.commentAllowed} characters`);
      }
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

    const invoiceData: LNURLPayResponse = await invoiceResponse.json();

    // Check if it's an error response
    if (invoiceData.pr === undefined || invoiceData.pr === null) {
      throw new Error('No invoice returned from LNURL endpoint');
    }

    return invoiceData.pr;
  }
}

