import { PubPayPost, FeedType } from '../types/postTypes';
import { ZapService, Nip05ValidationService } from '@pubpay/shared-services';

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
 * Validate a single lightning address
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

