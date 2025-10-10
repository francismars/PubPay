const sortUnique = (arr) => Array.from(new Set(arr)).sort();
const profileKey = (pubkey) => ['profile', pubkey];
// Batch fetch uncached pubkeys once, then write each into its own cache entry
export const ensureProfiles = async (qc, client, pubkeys) => {
    const unique = sortUnique(pubkeys);
    const result = new Map();
    // Identify which pubkeys are already cached
    const uncached = [];
    for (const pk of unique) {
        const cached = qc.getQueryData(profileKey(pk));
        if (cached) {
            result.set(pk, cached);
        }
        else {
            uncached.push(pk);
        }
    }
    if (uncached.length > 0) {
        const fetched = await client.getEvents([{ kinds: [0], authors: uncached }]);
        // Write-through cache per pubkey and populate result
        for (const evt of fetched) {
            qc.setQueryData(profileKey(evt.pubkey), evt, { updatedAt: Date.now() });
            result.set(evt.pubkey, evt);
        }
        // For pubkeys with no profile event, cache null to avoid re-fetch thrash briefly
        const fetchedSet = new Set(fetched.map(e => e.pubkey));
        for (const pk of uncached) {
            if (!fetchedSet.has(pk)) {
                qc.setQueryData(profileKey(pk), null, { updatedAt: Date.now() });
            }
        }
    }
    return result;
};
