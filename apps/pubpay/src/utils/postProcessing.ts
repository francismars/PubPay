import { Kind1Event, Kind0Event } from '@pubpay/shared-types';
import { safeJson } from '@pubpay/shared-utils';
import { extractZapPayerPubkeys } from '@pubpay/shared-services';
import { PubPayPost } from '../types/postTypes';
import { LIGHTNING } from '../constants';
import { genericUserIcon } from '../assets/images';

/**
 * Process posts with basic info only (like legacy drawKind1)
 * This creates posts with minimal data for progressive rendering
 */
export async function processPostsBasic(
  kind1Events: Kind1Event[],
  profileEvents: Kind0Event[],
  loadProfilesBatched: (pubkeys: string[]) => Promise<Map<string, Kind0Event>>
): Promise<PubPayPost[]> {
  const posts: PubPayPost[] = [];

  // Extract zap-payer pubkeys from events (no zaps yet, so just from events)
  const zapPayerPubkeys = extractZapPayerPubkeys(kind1Events, []);

  // Load zap-payer profiles
  let zapPayerProfiles: Kind0Event[] = [];
  if (zapPayerPubkeys.size > 0) {
    const map = await loadProfilesBatched(Array.from(zapPayerPubkeys));
    zapPayerProfiles = Array.from(map.values());
  }

  // Combine all profiles
  const allProfiles = [...profileEvents, ...zapPayerProfiles];

  for (const event of kind1Events) {
    const author = allProfiles.find(p => p.pubkey === event.pubkey);

    // Basic post info (no zaps yet)
    // Mark as loading if no author profile found (will be updated when profiles load)
    const hasAuthorProfile = author && author.content && author.content !== '{}';
    const post: PubPayPost = {
      id: event.id,
      event,
      author: author || {
        kind: 0,
        id: '',
        pubkey: event.pubkey,
        content: '{}',
        created_at: 0,
        sig: '',
        tags: []
      },
      createdAt: event.created_at,
      zapMin: 0,
      zapMax: 0,
      zapUses: 0,
      zapAmount: 0,
      zaps: [],
      zapUsesCurrent: 0,
      zapGoal: undefined,
      isPayable: true,
      hasZapTags: false,
      content: event.content,
      profileLoading: !hasAuthorProfile // Mark as loading if profile not found
    };

    // Extract zap min/max and overrides from tags
    const zapMinTag = event.tags.find(tag => tag[0] === 'zap-min');
    const zapMaxTag = event.tags.find(tag => tag[0] === 'zap-max');
    const zapUsesTag = event.tags.find(tag => tag[0] === 'zap-uses');
    const zapGoalTag = event.tags.find(tag => tag[0] === 'zap-goal');
    const zapPayerTag = event.tags.find(tag => tag[0] === 'zap-payer');
    const zapLNURLTag = event.tags.find(tag => tag[0] === 'zap-lnurl');

    if (zapMinTag && zapMinTag[1]) {
      post.zapMin = parseInt(zapMinTag[1]) / LIGHTNING.MILLISATS_PER_SAT || 0;
    }
    if (zapMaxTag && zapMaxTag[1]) {
      post.zapMax = parseInt(zapMaxTag[1]) / LIGHTNING.MILLISATS_PER_SAT || 0;
    }
    if (zapUsesTag && zapUsesTag[1]) {
      post.zapUses = parseInt(zapUsesTag[1]) || 0;
    }
    if (zapGoalTag && zapGoalTag[1]) {
      post.zapGoal = parseInt(zapGoalTag[1]) / LIGHTNING.MILLISATS_PER_SAT || undefined; // Convert from millisats to sats
    }
    if (zapPayerTag && zapPayerTag[1]) {
      post.zapPayer = zapPayerTag[1];

      // Find the zap-payer's profile picture
      const zapPayerProfile = allProfiles.find(
        p => p.pubkey === zapPayerTag[1]
      );
      if (zapPayerProfile) {
        try {
          const profileData = safeJson<Record<string, any>>(
            zapPayerProfile.content,
            {}
          );
          post.zapPayerPicture =
            (profileData as any).picture || genericUserIcon;
          post.zapPayerName =
            (profileData as any).display_name ||
            (profileData as any).name ||
            undefined;
        } catch {
          post.zapPayerPicture = genericUserIcon;
        }
      } else {
        post.zapPayerPicture = genericUserIcon;
      }
    }

    // Set zap LNURL override if present
    if (zapLNURLTag && zapLNURLTag[1]) {
      (post as any).zapLNURL = zapLNURLTag[1];
    }

    // Determine if payable (author lud16 or override LNURL) AND has zap tags
    try {
      const authorData = post.author
        ? safeJson<Record<string, any>>(
            (post.author as any).content || '{}',
            {}
          )
        : {};
      const hasLud16 = !!(authorData as any).lud16;
      const hasNip05 = !!(authorData as any).nip05;
      // hasZapTags should be true if any zap-related tag exists (zap-min, zap-max, zap-uses, zap-goal)
      const hasZapTags = !!(zapMinTag || zapMaxTag || zapUsesTag || zapGoalTag);
      post.hasZapTags = hasZapTags;
      // isPayable requires: lightning address AND payment amount (zap-min or zap-max)
      const hasPaymentAmount = !!(zapMinTag || zapMaxTag);
      post.isPayable = (hasLud16 || !!(post as any).zapLNURL) && hasPaymentAmount;
      // Mark as validating if we have a lightning address to validate
      if (hasLud16) {
        post.lightningValidating = true;
      }
      // Mark as validating if we have a NIP-05 identifier to validate
      if (hasNip05) {
        post.nip05Validating = true;
      }
    } catch {
      // hasZapTags should be true if any zap-related tag exists (zap-min, zap-max, zap-uses, zap-goal)
      const hasZapTags = !!(zapMinTag || zapMaxTag || zapUsesTag || zapGoalTag);
      post.hasZapTags = hasZapTags;
      // isPayable requires: lightning address AND payment amount (zap-min or zap-max)
      const hasPaymentAmount = !!(zapMinTag || zapMaxTag);
      post.isPayable = !!(post as any).zapLNURL && hasPaymentAmount;
    }

    posts.push(post);
  }

  // Sort by creation time (newest first) - matches legacy behavior
  return posts.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Process posts synchronously for immediate display (no async profile/zap loading)
 * This creates posts with minimal data for progressive rendering
 */
export function processPostsBasicSync(kind1Events: Kind1Event[]): PubPayPost[] {
  const posts: PubPayPost[] = [];

  for (const event of kind1Events) {
    // Basic post info (no profiles/zaps yet - will be loaded in background)
    const post: PubPayPost = {
      id: event.id,
      event,
      author: {
        kind: 0,
        id: '',
        pubkey: event.pubkey,
        content: '{}',
        created_at: 0,
        sig: '',
        tags: []
      },
      createdAt: event.created_at,
      zapMin: 0,
      zapMax: 0,
      zapUses: 0,
      zapAmount: 0,
      zaps: [],
      zapUsesCurrent: 0,
      zapGoal: undefined,
      isPayable: true,
      hasZapTags: false,
      content: event.content,
      profileLoading: true, // Mark as loading
      zapLoading: true // Mark zaps as loading
    };

    // Extract zap min/max and overrides from tags
    const zapMinTag = event.tags.find(tag => tag[0] === 'zap-min');
    const zapMaxTag = event.tags.find(tag => tag[0] === 'zap-max');
    const zapUsesTag = event.tags.find(tag => tag[0] === 'zap-uses');
    const zapGoalTag = event.tags.find(tag => tag[0] === 'zap-goal');
    const zapPayerTag = event.tags.find(tag => tag[0] === 'zap-payer');
    const zapLNURLTag = event.tags.find(tag => tag[0] === 'zap-lnurl');

    if (zapMinTag && zapMinTag[1]) {
      post.zapMin = Math.floor(parseInt(zapMinTag[1]) / 1000) || 0;
    }
    if (zapMaxTag && zapMaxTag[1]) {
      post.zapMax = Math.floor(parseInt(zapMaxTag[1]) / 1000) || 0;
    }
    if (zapUsesTag && zapUsesTag[1]) {
      post.zapUses = parseInt(zapUsesTag[1]) || 0;
    }
    if (zapGoalTag && zapGoalTag[1]) {
      post.zapGoal = Math.floor(parseInt(zapGoalTag[1]) / 1000) || undefined;
    }
    if (zapPayerTag && zapPayerTag[1]) {
      post.zapPayer = zapPayerTag[1];
      post.zapPayerPicture = genericUserIcon; // Will be updated when profile loads
    }

    // Set zap LNURL override if present
    if (zapLNURLTag && zapLNURLTag[1]) {
      (post as any).zapLNURL = zapLNURLTag[1];
    }

    // Determine if payable (will be recalculated when profile loads)
    const hasZapTags = !!(zapMinTag || zapMaxTag || zapUsesTag || zapGoalTag);
    post.hasZapTags = hasZapTags;
    const hasPaymentAmount = !!(zapMinTag || zapMaxTag);
    post.isPayable = hasPaymentAmount; // Will be updated when profile loads

    posts.push(post);
  }

  return posts;
}

/**
 * Calculate reply levels for proper indentation (matches legacy behavior)
 */
export function calculateReplyLevels(
  replies: PubPayPost[]
): (PubPayPost & { replyLevel: number })[] {
  const repliesWithLevels: (PubPayPost & { replyLevel: number })[] = [];
  const replyMap = new Map<string, number>(); // eventId -> level

  for (const reply of replies) {
    let level = 0;

    // Find the reply tag to get the parent event ID
    const replyTag = reply.event.tags.find(
      tag => tag[0] === 'e' && tag[3] === 'reply'
    );
    if (replyTag && replyTag[1]) {
      const parentEventId = replyTag[1];
      const parentLevel = replyMap.get(parentEventId);
      if (parentLevel !== undefined) {
        level = parentLevel + 1;
      }
    }

    replyMap.set(reply.id, level);
    repliesWithLevels.push({ ...reply, replyLevel: level });
  }

  return repliesWithLevels;
}

/**
 * Update a post with profile data and recalculate payment-related fields
 * Extracted to utility to remove duplication across hooks
 */
export function updatePostWithProfileData(
  post: PubPayPost,
  event: Kind1Event,
  author: Kind0Event | null | undefined
): PubPayPost {
  if (!author || author.content === '{}') {
    // Still loading, keep loading state
    return post;
  }

  // Profile loaded, clear loading state
  const updatedPost = { ...post, author, profileLoading: false };

  // Recalculate isPayable and related fields based on author profile
  try {
    const authorData = safeJson<Record<string, any>>(
      author.content || '{}',
      {}
    );
    const hasLud16 = !!(authorData as any).lud16;
    const hasNip05 = !!(authorData as any).nip05;

    // Extract zap tags from event
    const zapMinTag = event.tags.find(tag => tag[0] === 'zap-min');
    const zapMaxTag = event.tags.find(tag => tag[0] === 'zap-max');
    // zapLNURLTag found but not used (zapLNURL is set elsewhere)
    const hasZapTags = !!(
      zapMinTag ||
      zapMaxTag ||
      event.tags.find(tag => tag[0] === 'zap-uses') ||
      event.tags.find(tag => tag[0] === 'zap-goal')
    );
    const hasPaymentAmount = !!(zapMinTag || zapMaxTag);

    updatedPost.hasZapTags = hasZapTags;
    updatedPost.isPayable =
      (hasLud16 || !!(updatedPost as any).zapLNURL) && hasPaymentAmount;

    // Mark as validating if we have a lightning address or NIP-05
    if (hasLud16) {
      updatedPost.lightningValidating = true;
    }
    if (hasNip05) {
      updatedPost.nip05Validating = true;
    }
  } catch {
    // Keep existing values on error
  }

  return updatedPost;
}

