/**
 * PaymentTypeDetector - Detects the type of payment input
 */
import { nip19 } from 'nostr-tools';
import { LnurlService } from '../services/lightning/LnurlService';

export type PaymentType = 'invoice' | 'lightning-address' | 'lnurl' | 'nostr-user' | 'nostr-post' | null;

export interface PaymentTypeDetectionResult {
  type: PaymentType;
  data?: any;
}

export interface NostrUserData {
  pubkey: string;
  npub: string;
}

export interface NostrPostData {
  eventId: string;
  identifier: string; // note1 or nevent1
  author?: string; // From nevent1
  relays?: string[]; // From nevent1
}

/**
 * Detect the type of payment input (BOLT11 invoice, LNURL, Lightning Address, or Nostr user)
 */
export function detectPaymentType(input: string): PaymentTypeDetectionResult {
  const trimmed = input.trim();
  if (!trimmed) return { type: null };

  // Remove "lightning:" protocol prefix if present (for both invoices and LNURL)
  const cleanInput = trimmed.toLowerCase().startsWith('lightning:') 
    ? trimmed.substring(10) 
    : trimmed;

  // Check for BOLT11 invoice
  if (cleanInput.match(/^(lnbc|lntb|lnbcrt)/i)) {
    return { type: 'invoice', data: cleanInput };
  }

  // Check for LNURL (must be before Lightning Address check)
  if (LnurlService.isLnurl(trimmed)) {
    return { type: 'lnurl', data: trimmed };
  }

  // Check for Lightning Address
  const lightningAddressMatch = cleanInput.match(/^([a-z0-9_-]+)@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,})$/i);
  if (lightningAddressMatch) {
    return { type: 'lightning-address', data: cleanInput };
  }

  // Check for Nostr npub/nprofile/note/nevent
  try {
    const decoded = nip19.decode(cleanInput);
    if (decoded.type === 'npub') {
      return { type: 'nostr-user', data: { pubkey: decoded.data as string, npub: cleanInput } };
    } else if (decoded.type === 'nprofile') {
      const profile = decoded.data as any;
      return { type: 'nostr-user', data: { pubkey: profile.pubkey, npub: nip19.npubEncode(profile.pubkey) } };
    } else if (decoded.type === 'note') {
      const eventId = decoded.data as string;
      return { type: 'nostr-post', data: { eventId, identifier: cleanInput } };
    } else if (decoded.type === 'nevent') {
      const neventData = decoded.data as any;
      return { 
        type: 'nostr-post', 
        data: { 
          eventId: neventData.id, 
          identifier: cleanInput,
          author: neventData.author,
          relays: neventData.relays
        } 
      };
    }
  } catch {
    // Not a valid nostr address
  }

  // Check if it's a hex pubkey (64 chars)
  if (cleanInput.match(/^[0-9a-f]{64}$/i)) {
    try {
      const npub = nip19.npubEncode(cleanInput);
      return { type: 'nostr-user', data: { pubkey: cleanInput, npub } };
    } catch {
      // Invalid hex
    }
  }

  return { type: null };
}



