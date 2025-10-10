const sortUnique = (arr) => Array.from(new Set(arr)).sort();
export const zapsKey = (eventIds) => ['zaps', ...sortUnique(eventIds)];
export const fetchZaps = async (client, eventIds) => {
    if (eventIds.length === 0)
        return [];
    const unique = sortUnique(eventIds);
    return await client.getEvents([{ kinds: [9735], '#e': unique }]);
};
export const ensureZaps = async (qc, client, eventIds) => {
    return await qc.ensureQueryData({
        queryKey: zapsKey(eventIds),
        queryFn: () => fetchZaps(client, eventIds),
        staleTime: 30000
    });
};
