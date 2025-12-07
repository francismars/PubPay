import { useEffect } from 'react';
import { QUERY_LIMITS, LIMITS } from '../constants';
import { useProfileActions } from '../stores/useProfileStore';

interface UseProfileActivityLoaderOptions {
  targetPubkey: string;
  nostrClient: any;
}

/**
 * Hook for loading profile activity stats (paynotes created, pubpays received, zaps received)
 */
export const useProfileActivityLoader = (
  options: UseProfileActivityLoaderOptions
) => {
  const { targetPubkey, nostrClient } = options;

  const { setActivityLoading, setActivityStats } = useProfileActions();

  // Load activity stats (lightweight - IDs only for counting)
  useEffect(() => {
    const loadActivityStats = async () => {
      if (!targetPubkey || !nostrClient) return;

      setActivityLoading(true);
      try {
        // Helper function to paginate and get all event IDs (lightweight)
        const getAllEventIds = async (
          filter: any,
          description: string
        ): Promise<Set<string>> => {
          const allEventIds = new Set<string>();
          let until: number | undefined = undefined;
          const limit = QUERY_LIMITS.PROFILE_QUERY_LIMIT;
          let hasMore = true;
          let batchCount = 0;

          console.log(
            `[${description}] Starting to fetch event IDs with filter:`,
            filter
          );

          while (hasMore) {
            batchCount++;
            try {
              const batchFilter = {
                ...filter,
                limit,
                ...(until ? { until } : {})
              };

              const batch = (await nostrClient.getEvents([
                batchFilter
              ])) as any[];

              console.log(
                `[${description}] Batch ${batchCount} - Received ${batch.length} events`
              );

              if (batch.length === 0) {
                hasMore = false;
                break;
              }

              // Only extract IDs (lightweight)
              batch.forEach((event: any) => {
                if (event && event.id) {
                  allEventIds.add(event.id);
                }
              });

              // Sort to get oldest timestamp for pagination
              batch.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

              // If we got fewer events than the limit, we've reached the end
              if (batch.length < limit) {
                hasMore = false;
              } else {
                // Set until to the oldest event's timestamp for next batch
                const oldestEvent = batch[batch.length - 1];
                const oldestTimestamp = oldestEvent.created_at || 0;
                until = oldestTimestamp - 1;
              }

              // Safety limit to prevent infinite loops
              if (batchCount > 50) {
                console.warn(
                  `[${description}] Reached safety limit of 50 batches, stopping`
                );
                hasMore = false;
              }
            } catch (error) {
              console.error(
                `[${description}] Error fetching batch ${batchCount}:`,
                error
              );
              hasMore = false;
            }
          }

          console.log(
            `[${description}] Final count: ${allEventIds.size} unique event IDs`
          );

          return allEventIds;
        };

        // Fetch all kind:1 event IDs by this user (lightweight - just IDs)
        let allNoteIds: Set<string> = new Set();
        try {
          const allNotes = await getAllEventIds(
            {
              kinds: [1],
              authors: [targetPubkey]
            },
            'all notes'
          );
          allNoteIds = allNotes;
          console.log(`[stats] Fetched ${allNoteIds.size} total kind:1 event IDs`);
        } catch (error) {
          console.error('Error fetching all note IDs:', error);
        }

        // Fetch paynote IDs (try with #t filter first, fallback to client-side filtering)
        let paynoteIds: Set<string> = new Set();
        try {
          // Try querying with #t filter on relay side (more efficient)
          const paynotesWithFilter = await getAllEventIds(
            {
              kinds: [1],
              authors: [targetPubkey],
              '#t': ['pubpay']
            },
            'paynotes (with filter)'
          );
          paynoteIds = paynotesWithFilter;
          console.log(`[stats] Found ${paynoteIds.size} paynotes (with relay filter)`);
        } catch (error) {
          console.warn('Relay-side filtering failed, using all notes:', error);
          // Fallback: if relay doesn't support #t filter, we'd need to fetch all and filter
          // For now, use allNoteIds as approximation (will be less accurate)
          paynoteIds = allNoteIds;
        }

        // Count zaps where:
        //    - #e tag references one of the event IDs
        //    - #p tag matches targetPubkey (user is the recipient)
        const countZapsForEventIds = async (
          eventIdsSet: Set<string>,
          description: string
        ): Promise<number> => {
          if (eventIdsSet.size === 0) return 0;

          const seen = new Set<string>();

          // Query zaps received by this user (p tag = targetPubkey)
          try {
            // Get zaps where p tag matches targetPubkey
            const receipts = (await nostrClient.getEvents([
              { kinds: [9735], '#p': [targetPubkey], limit: LIMITS.ZAP_QUERY_LIMIT }
            ])) as any[];

            // Filter to only zaps that reference events in our set
            for (const receipt of receipts) {
              if (!receipt || !receipt.id || !receipt.tags) continue;

              // Check if this zap references one of our events
              const eventTag = receipt.tags.find(
                (tag: any[]) => tag[0] === 'e'
              );
              if (!eventTag || !eventTag[1]) continue;

              const referencedEventId = eventTag[1];
              if (eventIdsSet.has(referencedEventId)) {
                seen.add(receipt.id);
              }
            }
          } catch (error) {
            console.error(`Error counting ${description}:`, error);
          }

          return seen.size;
        };

        const [pubpaysReceived, zapsReceived] = await Promise.all([
          countZapsForEventIds(paynoteIds, 'pubpays received'),
          countZapsForEventIds(allNoteIds, 'zaps received')
        ]);

        setActivityStats({
          paynotesCreated: paynoteIds.size,
          pubpaysReceived,
          zapsReceived
        });
      } catch (error) {
        console.error('Error loading activity stats:', error);
        // Set to zero on error
        setActivityStats({
          paynotesCreated: 0,
          pubpaysReceived: 0,
          zapsReceived: 0
        });
      } finally {
        setActivityLoading(false);
      }
    };

    loadActivityStats();
  }, [targetPubkey, nostrClient, setActivityLoading, setActivityStats]);
};

