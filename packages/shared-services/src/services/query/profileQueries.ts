import { QueryClient } from '@tanstack/react-query';
import { Kind0Event } from '@pubpay/shared-types';
import { NostrClient } from '../nostr/NostrClient';

const sortUnique = (arr: string[]) => Array.from(new Set(arr)).sort();
const profileKey = (pubkey: string) => ['profile', pubkey];

// Batch fetch uncached pubkeys once, then write each into its own cache entry
export const ensureProfiles = async (
  qc: QueryClient,
  client: NostrClient,
  pubkeys: string[]
): Promise<Map<string, Kind0Event>> => {
  const unique = sortUnique(pubkeys);
  const result = new Map<string, Kind0Event>();

  // Identify which pubkeys are already cached
  const uncached: string[] = [];
  for (const pk of unique) {
    const cached = qc.getQueryData<Kind0Event | null>(profileKey(pk));
    if (cached) {
      result.set(pk, cached);
    } else {
      uncached.push(pk);
    }
  }

  if (uncached.length > 0) {
    const fetched = (await client.getEvents([
      { kinds: [0], authors: uncached }
    ])) as Kind0Event[];

    // Deduplicate by pubkey, keeping the newest event (highest created_at)
    const deduplicated = new Map<string, Kind0Event>();
    for (const evt of fetched) {
      const existing = deduplicated.get(evt.pubkey);
      if (!existing || evt.created_at > existing.created_at) {
        deduplicated.set(evt.pubkey, evt);
      }
    }

    // Write-through cache per pubkey and populate result
    for (const evt of deduplicated.values()) {
      qc.setQueryData(profileKey(evt.pubkey), evt, { updatedAt: Date.now() });
      result.set(evt.pubkey, evt);
    }

    // For pubkeys with no profile event, cache null to avoid re-fetch thrash briefly
    const fetchedSet = new Set(deduplicated.keys());
    for (const pk of uncached) {
      if (!fetchedSet.has(pk)) {
        qc.setQueryData(profileKey(pk), null, { updatedAt: Date.now() });
      }
    }
  }

  return result;
};
