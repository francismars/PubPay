import { PubPayPost } from '../types/postTypes';
import { ZapService, Nip05ValidationService } from '@pubpay/shared-services';

// ============================================================================
// VALIDATION CONSTANTS
// ============================================================================

export const VALIDATION_LIMITS = {
  PAYMENT_AMOUNT: { MIN: 1, MAX: 21000000 }, // 21M sats (Bitcoin supply)
  NOTE_CONTENT: { MIN: 1, MAX: 10000 }, // Characters
  LIGHTNING_ADDRESS: { MAX_LENGTH: 320 }, // RFC 5321 email length limit
  INVOICE: { MAX_LENGTH: 2000 }, // BOLT11 invoices are typically < 1000, but allow buffer
  PROFILE_NAME: { MIN: 1, MAX: 100 },
  PROFILE_BIO: { MAX: 5000 },
  PROFILE_WEBSITE: { MAX: 2048 }, // URL length limit
  PROFILE_NIP05: { MAX_LENGTH: 320 }, // Email format
  JSON_PAYLOAD: { MAX_SIZE: 100000 }, // 100KB for profile JSON
  ARRAY_MAX_ITEMS: 1000 // Max items in arrays (tags, mentions, etc.)
} as const;

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ValidationResultWithErrors {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// PAYMENT AMOUNT VALIDATION
// ============================================================================

/**
 * Validate payment amount (in sats)
 * @param amount - Amount as number or string
 * @returns Validation result with error message if invalid
 */
export function validatePaymentAmount(amount: number | string): ValidationResult {
  // Convert to number if string (use parseInt for integers)
  const numAmount = typeof amount === 'string' ? parseInt(amount.trim(), 10) : amount;

  // Check if NaN or not a valid integer
  if (isNaN(numAmount) || !Number.isInteger(numAmount)) {
    return {
      valid: false,
      error: 'Amount must be a valid whole number (no decimals)'
    };
  }

  // Check min limit
  if (numAmount < VALIDATION_LIMITS.PAYMENT_AMOUNT.MIN) {
    return {
      valid: false,
      error: `Amount must be at least ${VALIDATION_LIMITS.PAYMENT_AMOUNT.MIN} sat`
    };
  }

  // Check max limit
  if (numAmount > VALIDATION_LIMITS.PAYMENT_AMOUNT.MAX) {
    return {
      valid: false,
      error: `Amount cannot exceed ${VALIDATION_LIMITS.PAYMENT_AMOUNT.MAX.toLocaleString()} sats (21M BTC)`
    };
  }

  return { valid: true };
}

/**
 * Validate payment amount range (min and max)
 */
export function validatePaymentAmountRange(
  min: number | string,
  max: number | string
): ValidationResult {
  const minResult = validatePaymentAmount(min);
  if (!minResult.valid) {
    return { valid: false, error: `Minimum amount: ${minResult.error}` };
  }

  const maxResult = validatePaymentAmount(max);
  if (!maxResult.valid) {
    return { valid: false, error: `Maximum amount: ${maxResult.error}` };
  }

  const minNum = typeof min === 'string' ? parseInt(min.trim(), 10) : min;
  const maxNum = typeof max === 'string' ? parseInt(max.trim(), 10) : max;

  if (minNum > maxNum) {
    return {
      valid: false,
      error: 'Minimum amount must be less than or equal to maximum amount'
    };
  }

  return { valid: true };
}

// ============================================================================
// NOTE CONTENT VALIDATION
// ============================================================================

/**
 * Validate note content length
 * @param content - Note content string
 * @returns Validation result with error message if invalid
 */
export function validateNoteContent(content: string): ValidationResult {
  if (!content || typeof content !== 'string') {
    return {
      valid: false,
      error: 'Note content is required'
    };
  }

  const trimmed = content.trim();

  if (trimmed.length < VALIDATION_LIMITS.NOTE_CONTENT.MIN) {
    return {
      valid: false,
      error: `Note content must be at least ${VALIDATION_LIMITS.NOTE_CONTENT.MIN} character${VALIDATION_LIMITS.NOTE_CONTENT.MIN > 1 ? 's' : ''}`
    };
  }

  if (trimmed.length > VALIDATION_LIMITS.NOTE_CONTENT.MAX) {
    return {
      valid: false,
      error: `Note content cannot exceed ${VALIDATION_LIMITS.NOTE_CONTENT.MAX.toLocaleString()} characters`
    };
  }

  return { valid: true };
}

// ============================================================================
// LIGHTNING ADDRESS VALIDATION
// ============================================================================

/**
 * Validate lightning address format (strict)
 * Format: user@domain.com (must match email-like pattern)
 * @param address - Lightning address string
 * @returns Validation result with error message if invalid
 */
export function validateLightningAddressFormat(address: string): ValidationResult {
  if (!address || typeof address !== 'string') {
    return {
      valid: false,
      error: 'Lightning address is required'
    };
  }

  const trimmed = address.trim();

  // Check length
  if (trimmed.length > VALIDATION_LIMITS.LIGHTNING_ADDRESS.MAX_LENGTH) {
    return {
      valid: false,
      error: `Lightning address cannot exceed ${VALIDATION_LIMITS.LIGHTNING_ADDRESS.MAX_LENGTH} characters`
    };
  }

  // Strict format: user@domain.tld
  // Must have exactly one @
  const atCount = (trimmed.match(/@/g) || []).length;
  if (atCount !== 1) {
    return {
      valid: false,
      error: 'Lightning address must contain exactly one @ symbol'
    };
  }

  const [localPart, domain] = trimmed.split('@');

  // Validate local part (before @)
  if (!localPart || localPart.length === 0) {
    return {
      valid: false,
      error: 'Lightning address must have a username before @'
    };
  }

  if (localPart.length > 64) {
    return {
      valid: false,
      error: 'Username part cannot exceed 64 characters'
    };
  }

  // Validate domain part (after @)
  if (!domain || domain.length === 0) {
    return {
      valid: false,
      error: 'Lightning address must have a domain after @'
    };
  }

  // Domain must contain at least one dot
  if (!domain.includes('.')) {
    return {
      valid: false,
      error: 'Domain must contain at least one dot (e.g., example.com)'
    };
  }

  // Domain must have valid TLD (at least 2 chars after last dot)
  const domainParts = domain.split('.');
  const tld = domainParts[domainParts.length - 1];
  if (!tld || tld.length < 2) {
    return {
      valid: false,
      error: 'Domain must have a valid top-level domain (e.g., .com, .org)'
    };
  }

  // Basic character validation (alphanumeric, dots, hyphens, underscores)
  const localPartRegex = /^[a-zA-Z0-9._-]+$/;
  if (!localPartRegex.test(localPart)) {
    return {
      valid: false,
      error: 'Username can only contain letters, numbers, dots, hyphens, and underscores'
    };
  }

  const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!domainRegex.test(domain)) {
    return {
      valid: false,
      error: 'Domain format is invalid'
    };
  }

  return { valid: true };
}

// ============================================================================
// INVOICE VALIDATION
// ============================================================================

/**
 * Validate BOLT11 invoice format and length
 * @param invoice - Invoice string (should start with 'ln')
 * @returns Validation result with error message if invalid
 */
export function validateInvoice(invoice: string): ValidationResult {
  if (!invoice || typeof invoice !== 'string') {
    return {
      valid: false,
      error: 'Invoice is required'
    };
  }

  const trimmed = invoice.trim();

  // Check length
  if (trimmed.length > VALIDATION_LIMITS.INVOICE.MAX_LENGTH) {
    return {
      valid: false,
      error: `Invoice cannot exceed ${VALIDATION_LIMITS.INVOICE.MAX_LENGTH} characters`
    };
  }

  // Check if starts with 'ln' (BOLT11 format)
  if (!trimmed.toLowerCase().startsWith('ln')) {
    return {
      valid: false,
      error: 'Invoice must start with "ln" (BOLT11 format)'
    };
  }

  // Basic character validation (bech32 characters)
  const bech32Regex = /^ln[a-z0-9]+$/i;
  if (!bech32Regex.test(trimmed)) {
    return {
      valid: false,
      error: 'Invoice contains invalid characters (must be bech32 encoded)'
    };
  }

  return { valid: true };
}

// ============================================================================
// PROFILE DATA VALIDATION
// ============================================================================

/**
 * Validate profile data schema and field lengths
 * @param data - Profile data object
 * @returns Validation result with array of errors
 */
export function validateProfileData(data: unknown): ValidationResultWithErrors {
  const errors: string[] = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      valid: false,
      errors: ['Profile data must be an object']
    };
  }

  // Type guard: data is now Record<string, unknown>
  const profileData = data as Record<string, unknown>;

  // Validate display name
  if (profileData.display_name !== undefined && profileData.display_name !== null) {
    const name = String(profileData.display_name);
    if (name.length > VALIDATION_LIMITS.PROFILE_NAME.MAX) {
      errors.push(`Display name cannot exceed ${VALIDATION_LIMITS.PROFILE_NAME.MAX} characters`);
    }
    if (name.length > 0 && name.length < VALIDATION_LIMITS.PROFILE_NAME.MIN) {
      errors.push(`Display name must be at least ${VALIDATION_LIMITS.PROFILE_NAME.MIN} character`);
    }
  }

  // Validate name (alternative field)
  if (profileData.name !== undefined && profileData.name !== null) {
    const name = String(profileData.name);
    if (name.length > VALIDATION_LIMITS.PROFILE_NAME.MAX) {
      errors.push(`Name cannot exceed ${VALIDATION_LIMITS.PROFILE_NAME.MAX} characters`);
    }
  }

  // Validate bio/about
  if (profileData.about !== undefined && profileData.about !== null) {
    const bio = String(profileData.about);
    if (bio.length > VALIDATION_LIMITS.PROFILE_BIO.MAX) {
      errors.push(`Bio cannot exceed ${VALIDATION_LIMITS.PROFILE_BIO.MAX} characters`);
    }
  }

  // Validate website
  if (profileData.website !== undefined && profileData.website !== null) {
    const website = String(profileData.website);
    if (website.length > VALIDATION_LIMITS.PROFILE_WEBSITE.MAX) {
      errors.push(`Website URL cannot exceed ${VALIDATION_LIMITS.PROFILE_WEBSITE.MAX} characters`);
    }
    if (website.length > 0) {
      try {
        new URL(website);
      } catch {
        errors.push('Website must be a valid URL');
      }
    }
  }

  // Validate lightning address
  if (profileData.lud16 !== undefined && profileData.lud16 !== null) {
    const lud16Result = validateLightningAddressFormat(String(profileData.lud16));
    if (!lud16Result.valid) {
      errors.push(`Lightning address: ${lud16Result.error}`);
    }
  }

  // Validate NIP-05
  if (profileData.nip05 !== undefined && profileData.nip05 !== null) {
    const nip05 = String(profileData.nip05);
    if (nip05.length > VALIDATION_LIMITS.PROFILE_NIP05.MAX_LENGTH) {
      errors.push(`NIP-05 cannot exceed ${VALIDATION_LIMITS.PROFILE_NIP05.MAX_LENGTH} characters`);
    }
    // NIP-05 follows email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (nip05.length > 0 && !emailRegex.test(nip05)) {
      errors.push('NIP-05 must be in email format (user@domain.com)');
    }
  }

  // Validate JSON payload size (if stringified)
  try {
    const jsonString = JSON.stringify(data);
    if (jsonString.length > VALIDATION_LIMITS.JSON_PAYLOAD.MAX_SIZE) {
      errors.push(`Profile data is too large (max ${VALIDATION_LIMITS.JSON_PAYLOAD.MAX_SIZE / 1000}KB)`);
    }
  } catch {
    errors.push('Profile data cannot be serialized to JSON');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// ARRAY VALIDATION
// ============================================================================

/**
 * Validate array length
 * @param array - Array to validate
 * @param maxItems - Maximum number of items (defaults to VALIDATION_LIMITS.ARRAY_MAX_ITEMS)
 * @returns Validation result
 */
export function validateArrayLength(
  array: unknown[],
  maxItems: number = VALIDATION_LIMITS.ARRAY_MAX_ITEMS
): ValidationResult {
  if (!Array.isArray(array)) {
    return {
      valid: false,
      error: 'Value must be an array'
    };
  }

  if (array.length > maxItems) {
    return {
      valid: false,
      error: `Array cannot contain more than ${maxItems} items`
    };
  }

  return { valid: true };
}

// ============================================================================
// EXISTING POST VALIDATION FUNCTIONS (preserved)
// ============================================================================

/**
 * Extract unique lightning addresses from posts
 * Returns a map of lightning address -> posts that have that address
 */
export function extractLightningAddresses(
  posts: PubPayPost[]
): Map<string, PubPayPost[]> {
  const lightningAddresses = new Map<string, PubPayPost[]>();

  for (const post of posts) {
    if (post.author) {
      try {
        const authorData = JSON.parse(post.author.content || '{}');
        const lud16 = authorData?.lud16;
        if (lud16 && typeof lud16 === 'string') {
          if (!lightningAddresses.has(lud16)) {
            lightningAddresses.set(lud16, []);
          }
          lightningAddresses.get(lud16)!.push(post);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  return lightningAddresses;
}

/**
 * Extract unique NIP-05 identifiers from posts with their pubkeys
 * Returns a map of key (nip05:pubkey) -> { nip05, pubkey, posts }
 */
export function extractNip05s(
  posts: PubPayPost[]
): Map<string, { nip05: string; pubkey: string; posts: PubPayPost[] }> {
  const nip05s = new Map<string, { nip05: string; pubkey: string; posts: PubPayPost[] }>();

  for (const post of posts) {
    if (post.author) {
      try {
        const authorData = JSON.parse(post.author.content || '{}');
        const nip05 = authorData?.nip05;
        if (nip05 && typeof nip05 === 'string' && post.event.pubkey) {
          const key = `${nip05}:${post.event.pubkey}`;
          if (!nip05s.has(key)) {
            nip05s.set(key, { nip05, pubkey: post.event.pubkey, posts: [] });
          }
          nip05s.get(key)!.posts.push(post);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  return nip05s;
}

/**
 * Validate a single lightning address (async validation with service)
 * Returns the validation result and updated post data
 */
export async function validateLightningAddress(
  lud16: string,
  posts: PubPayPost[]
): Promise<{ isValid: boolean; updatedPosts: PubPayPost[] }> {
  try {
    const isValid = await ZapService.validateLightningAddress(lud16);

    // Update all posts with this lightning address
    const updatedPosts = posts.map(post => ({
      ...post,
      lightningValid: isValid,
      lightningValidating: false,
      // Update isPayable based on validation result
      isPayable: !!(isValid && post.hasZapTags &&
        (post.zapUses === 0 || post.zapUsesCurrent < post.zapUses))
    }));

    return { isValid, updatedPosts };
  } catch (error) {
    console.warn(`Failed to validate lightning address ${lud16}:`, error);
    // Mark as invalid on error
    const updatedPosts = posts.map(post => ({
      ...post,
      lightningValid: false,
      lightningValidating: false,
      isPayable: false
    }));
    return { isValid: false, updatedPosts };
  }
}

/**
 * Validate a single NIP-05 identifier
 * Returns the validation result and updated post data
 */
export async function validateNip05(
  nip05: string,
  pubkey: string,
  posts: PubPayPost[]
): Promise<{ isValid: boolean; updatedPosts: PubPayPost[] }> {
  try {
    const isValid = await Nip05ValidationService.validateNip05(nip05, pubkey);

    // Update all posts with this NIP-05
    const updatedPosts = posts.map(post => ({
      ...post,
      nip05Valid: isValid,
      nip05Validating: false
    }));

    return { isValid, updatedPosts };
  } catch (error) {
    console.warn(`Failed to validate NIP-05 ${nip05}:`, error);
    // Mark as invalid on error
    const updatedPosts = posts.map(post => ({
      ...post,
      nip05Valid: false,
      nip05Validating: false
    }));
    return { isValid: false, updatedPosts };
  }
}

