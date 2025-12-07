import { useCallback } from 'react';
import { NostrClient } from '@pubpay/shared-services';
import { ensureProfiles, getQueryClient } from '@pubpay/shared-services';
import { Kind0Event } from '@pubpay/shared-types';

interface UseProfileLoaderOptions {
  nostrClientRef: React.MutableRefObject<NostrClient | null>;
  profileCacheRef: React.MutableRefObject<Map<string, Kind0Event>>;
  pendingProfileRequestsRef: React.MutableRefObject<Set<string>>;
}

/**
 * Hook for batched profile loading to prevent duplicate requests
 * Extracted from useFeedLoader for better separation of concerns
 */
export const useProfileLoader = (options: UseProfileLoaderOptions) => {
  const { nostrClientRef, profileCacheRef, pendingProfileRequestsRef } = options;

  const loadProfilesBatched = useCallback(
    async (pubkeys: string[]): Promise<Map<string, Kind0Event>> => {
      const profiles = new Map<string, Kind0Event>();
      const uncachedPubkeys: string[] = [];

      // Check cache first
      for (const pubkey of pubkeys) {
        const cached = profileCacheRef.current.get(pubkey);
        if (cached) {
          profiles.set(pubkey, cached);
        } else if (!pendingProfileRequestsRef.current.has(pubkey)) {
          uncachedPubkeys.push(pubkey);
        }
      }

      // Load uncached profiles in batches
      if (uncachedPubkeys.length > 0 && nostrClientRef.current) {
        // Mark as pending to prevent duplicate requests
        uncachedPubkeys.forEach(pubkey =>
          pendingProfileRequestsRef.current.add(pubkey)
        );

        try {
          // Use ensureProfiles for centralized profile loading
          const profileMap = await ensureProfiles(
            getQueryClient(),
            nostrClientRef.current!,
            uncachedPubkeys
          );
          const profileEvents = Array.from(profileMap.values());

          // Cache the results
          profileEvents.forEach(profile => {
            profileCacheRef.current.set(profile.pubkey, profile);
            profiles.set(profile.pubkey, profile);
          });

          // Remove from pending
          uncachedPubkeys.forEach(pubkey =>
            pendingProfileRequestsRef.current.delete(pubkey)
          );
        } catch (error) {
          console.error('Error loading profiles:', error);
          // Remove from pending on error
          uncachedPubkeys.forEach(pubkey =>
            pendingProfileRequestsRef.current.delete(pubkey)
          );
        }
      }

      return profiles;
    },
    [nostrClientRef, profileCacheRef, pendingProfileRequestsRef]
  );

  return {
    loadProfilesBatched
  };
};

