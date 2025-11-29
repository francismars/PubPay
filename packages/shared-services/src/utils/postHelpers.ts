import { Kind1Event, Kind0Event } from '@pubpay/shared-types';
import { safeJson } from './nostrSchemas';

/**
 * Extracted zap-related tags from a post event
 */
export interface PostZapTags {
  zapMin: number; // in sats
  zapMax: number; // in sats
  zapUses: number;
  zapGoal?: number; // in sats
  zapPayer?: string; // pubkey
  zapLNURL?: string;
  hasZapTags: boolean;
  hasPaymentAmount: boolean;
}

/**
 * Extract all zap-related tags from a post event
 */
export function extractPostZapTags(event: Kind1Event): PostZapTags {
  const zapMinTag = event.tags.find(tag => tag[0] === 'zap-min');
  const zapMaxTag = event.tags.find(tag => tag[0] === 'zap-max');
  const zapUsesTag = event.tags.find(tag => tag[0] === 'zap-uses');
  const zapGoalTag = event.tags.find(tag => tag[0] === 'zap-goal');
  const zapPayerTag = event.tags.find(tag => tag[0] === 'zap-payer');
  const zapLNURLTag = event.tags.find(tag => tag[0] === 'zap-lnurl');
  
  const zapMin = zapMinTag ? Math.floor(parseInt(zapMinTag[1] || '0') / 1000) : 0;
  const zapMax = zapMaxTag ? Math.floor(parseInt(zapMaxTag[1] || '0') / 1000) : zapMin;
  const zapUses = zapUsesTag ? parseInt(zapUsesTag[1] || '0') : 0;
  const zapGoal = zapGoalTag ? Math.floor(parseInt(zapGoalTag[1] || '0') / 1000) : undefined;
  const zapPayer = zapPayerTag?.[1];
  const zapLNURL = zapLNURLTag?.[1];
  
  const hasZapTags = !!(zapMinTag || zapMaxTag || zapUsesTag || zapGoalTag);
  const hasPaymentAmount = !!(zapMinTag || zapMaxTag);
  
  return {
    zapMin,
    zapMax,
    zapUses,
    zapGoal,
    zapPayer,
    zapLNURL,
    hasZapTags,
    hasPaymentAmount
  };
}

/**
 * Calculate if a post is payable based on author profile and zap tags
 */
export function calculateIsPayable(
  author: Kind0Event | null,
  zapTags: PostZapTags
): boolean {
  if (!zapTags.hasPaymentAmount) return false;
  
  // Check for lightning address in author profile
  let hasLud16 = false;
  if (author && author.content && author.content !== '{}') {
    try {
      const authorData = safeJson<Record<string, any>>(author.content, {});
      hasLud16 = !!(authorData as any).lud16;
    } catch {
      // Keep hasLud16 as false
    }
  }
  
  // Post is payable if: (has lightning address OR zap LNURL override) AND has payment amount
  return (hasLud16 || !!zapTags.zapLNURL) && zapTags.hasPaymentAmount;
}

/**
 * Get zap payer profile picture and name from profiles map
 */
export function getZapPayerProfile(
  zapPayerPubkey: string | undefined,
  profiles: Map<string, Kind0Event>,
  genericUserIcon: string = '/images/gradient_color.gif'
): { picture: string; name?: string } {
  if (!zapPayerPubkey) {
    return { picture: genericUserIcon };
  }
  
  const zapPayerProfile = profiles.get(zapPayerPubkey);
  if (!zapPayerProfile || !zapPayerProfile.content || zapPayerProfile.content === '{}') {
    return { picture: genericUserIcon };
  }
  
  try {
    const profileData = safeJson<Record<string, any>>(zapPayerProfile.content, {});
    return {
      picture: (profileData as any).picture || genericUserIcon,
      name: (profileData as any).display_name || (profileData as any).name || undefined
    };
  } catch {
    return { picture: genericUserIcon };
  }
}

/**
 * Check if author has lightning address or NIP-05
 */
export function getAuthorPaymentInfo(author: Kind0Event | null): {
  hasLud16: boolean;
  hasNip05: boolean;
} {
  if (!author || !author.content || author.content === '{}') {
    return { hasLud16: false, hasNip05: false };
  }
  
  try {
    const authorData = safeJson<Record<string, any>>(author.content, {});
    return {
      hasLud16: !!(authorData as any).lud16,
      hasNip05: !!(authorData as any).nip05
    };
  } catch {
    return { hasLud16: false, hasNip05: false };
  }
}

