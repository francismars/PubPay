import { nip19 } from 'nostr-tools';

/**
 * Validation function for pubkeys and npubs/nprofiles
 * @param pubkey - The pubkey, npub, or nprofile string to validate
 * @returns true if the pubkey is in a valid format
 */
export const isValidPublicKey = (pubkey: string): boolean => {
  // Check for hex pubkey format (64 characters)
  if (/^[0-9a-f]{64}$/i.test(pubkey)) {
    return true;
  }

  // Check for npub format
  if (pubkey.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(pubkey);
      return decoded.type === 'npub';
    } catch {
      return false;
    }
  }

  // Check for nprofile format
  if (pubkey.startsWith('nprofile1')) {
    try {
      const decoded = nip19.decode(pubkey);
      return decoded.type === 'nprofile';
    } catch {
      return false;
    }
  }

  return false;
};

/**
 * Extract hex pubkey from npub/nprofile for profile loading
 * @param pubkeyOrNpub - The pubkey, npub, or nprofile string
 * @returns The hex pubkey, or the original string if conversion fails
 */
export const getHexPubkey = (pubkeyOrNpub: string): string => {
  if (!pubkeyOrNpub) return '';

  // If it's already a hex pubkey, return it
  if (/^[0-9a-f]{64}$/i.test(pubkeyOrNpub)) {
    return pubkeyOrNpub;
  }

  // If it's an npub or nprofile, decode it
  if (
    pubkeyOrNpub.startsWith('npub1') ||
    pubkeyOrNpub.startsWith('nprofile1')
  ) {
    try {
      const decoded = nip19.decode(pubkeyOrNpub);
      if (decoded.type === 'npub') {
        return decoded.data;
      } else if (decoded.type === 'nprofile') {
        return decoded.data.pubkey;
      }
    } catch (error) {
      console.error('Failed to decode npub/nprofile:', error);
    }
  }

  return pubkeyOrNpub;
};

/**
 * Get npub for NIP-05 purchase
 * @param publicKey - The public key to encode as npub
 * @returns The npub string, or empty string if publicKey is null/undefined
 */
export const getNpubForPurchase = (publicKey: string | null): string => {
  if (!publicKey) return '';
  try {
    return nip19.npubEncode(publicKey);
  } catch {
    return publicKey;
  }
};

/**
 * Trim website URL for display (removes protocol)
 * @param url - The URL to trim
 * @returns The trimmed URL without protocol
 */
export const trimWebsiteUrl = (url: string): string => {
  if (!url) return url;
  return url.replace(/^https?:\/\//, '');
};

/**
 * Trim npub for display (show first 12 and last 8 characters)
 * @param npub - The npub string to trim
 * @returns The trimmed npub string
 */
export const trimNpub = (npub: string): string => {
  if (!npub || npub.length <= 12) return npub;
  return `${npub.substring(0, 12)}...${npub.substring(npub.length - 8)}`;
};

/**
 * Convert public key to npub format
 * Handles hex pubkeys, npubs, and nprofiles
 * @param pubkey - The pubkey to convert (optional, can be hex, npub, or nprofile)
 * @param fallbackPubkey - Fallback pubkey if first parameter is not provided
 * @returns The npub string, or empty string if conversion fails
 */
export const getNpubFromPublicKey = (
  pubkey?: string,
  fallbackPubkey?: string | null
): string => {
  const keyToConvert = pubkey || fallbackPubkey;
  if (!keyToConvert) return '';

  try {
    // If it's already an npub, return it
    if (keyToConvert.startsWith('npub1')) {
      return keyToConvert;
    }

    // If it's an nprofile, extract the pubkey and convert to npub
    if (keyToConvert.startsWith('nprofile1')) {
      const decoded = nip19.decode(keyToConvert);
      if ((decoded as any).type === 'nprofile') {
        return nip19.npubEncode((decoded.data as any).pubkey);
      }
    }

    // If it's a hex string, convert to npub
    if (keyToConvert.length === 64 && /^[0-9a-fA-F]+$/.test(keyToConvert)) {
      return nip19.npubEncode(keyToConvert);
    }

    // If it's already a string, try to encode it directly
    return nip19.npubEncode(keyToConvert);
  } catch (error) {
    console.error('Failed to convert public key to npub:', error);
    return keyToConvert; // Return original if conversion fails
  }
};

