export const postsKey = (params) => ['posts', params.until ?? null, params.limit ?? 21];
export const fetchPosts = async (client, params) => {
    const filter = {
        kinds: [1],
        '#t': ['pubpay'],
        limit: params.limit ?? 21,
        ...(params.until ? { until: params.until } : {})
    };
    return await client.getEvents([filter]);
};
export const ensurePosts = async (qc, client, params) => {
    return await qc.ensureQueryData({
        queryKey: postsKey(params),
        queryFn: () => fetchPosts(client, params),
        staleTime: 10000
    });
};
