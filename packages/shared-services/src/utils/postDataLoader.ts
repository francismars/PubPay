import { QueryClient } from '@tanstack/react-query';
import { Kind1Event, Kind0Event, Kind9735Event } from '@pubpay/shared-types';
import { NostrClient } from '../services/nostr/NostrClient';
import { ensureProfiles } from '../services/query/profileQueries';
import { ensureZaps } from '../services/query/zapQueries';
import { extractZapPayerPubkeys } from './zapHelpers';

/**
 * Complete post data with all related information
 */
export interface PostData {
  events: Kind1Event[];
  profiles: Map<string, Kind0Event>;
  zaps: Kind9735Event[];
  zapPayerProfiles: Map<string, Kind0Event>;
}

/**
 * Options for loading post data
 */
export interface LoadPostDataOptions {
  /**
   * Whether to load zaps for the events
   * @default true
   */
  loadZaps?: boolean;
  
  /**
   * Whether to load zap payer profiles
   * @default true
   */
  loadZapPayerProfiles?: boolean;
  
  /**
   * Generic user icon path for fallback
   * @default '/images/gradient_color.gif'
   */
  genericUserIcon?: string;
}

/**
 * Load all data needed for processing posts (events, profiles, zaps, zap payer profiles)
 * This is the unified function that handles all the repeated loading patterns
 */
export async function loadPostData(
  queryClient: QueryClient,
  nostrClient: NostrClient,
  events: Kind1Event[],
  options: LoadPostDataOptions = {}
): Promise<PostData> {
  const {
    loadZaps = true,
    loadZapPayerProfiles = true
  } = options;
  
  // Extract author pubkeys
  const authorPubkeys = Array.from(new Set(events.map(event => event.pubkey)));
  
  // Load author profiles and zaps in parallel
  const [profileMap, zapEvents] = await Promise.all([
    ensureProfiles(queryClient, nostrClient, authorPubkeys),
    loadZaps
      ? ensureZaps(
          queryClient,
          nostrClient,
          events.map(event => event.id)
        )
      : Promise.resolve([] as Kind9735Event[])
  ]);
  
  // Extract zap payer pubkeys
  const zapPayerPubkeys = loadZapPayerProfiles && loadZaps
    ? extractZapPayerPubkeys(events, zapEvents)
    : new Set<string>();
  
  // Load zap payer profiles
  const zapPayerProfileMap =
    zapPayerPubkeys.size > 0
      ? await ensureProfiles(
          queryClient,
          nostrClient,
          Array.from(zapPayerPubkeys)
        )
      : new Map<string, Kind0Event>();
  
  // Combine all profiles into single map
  const allProfiles = new Map(profileMap);
  zapPayerProfileMap.forEach((profile, pubkey) => {
    allProfiles.set(pubkey, profile);
  });
  
  return {
    events,
    profiles: allProfiles,
    zaps: zapEvents,
    zapPayerProfiles: zapPayerProfileMap
  };
}

