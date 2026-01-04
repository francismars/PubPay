import { QueryClient } from '@tanstack/react-query';
import { Kind1Event, NostrFilter } from '@pubpay/shared-types';
import { NostrClient } from '../nostr/NostrClient';

export type PostsParams = {
  until?: number;
  limit?: number;
  authors?: string[];
  feedMode?: 'pubpay' | 'nostr';
};

export const postsKey = (params: PostsParams) => [
  'posts',
  params.until ?? null,
  params.limit ?? 21,
  params.authors ?? null,
  params.feedMode ?? 'pubpay'
];

export const fetchPosts = async (
  client: NostrClient,
  params: PostsParams
): Promise<Kind1Event[]> => {
  const filter: NostrFilter = {
    kinds: [1],
    limit: params.limit ?? 21,
    ...(params.until ? { until: params.until } : {}),
    ...(params.authors && params.authors.length > 0
      ? { authors: params.authors }
      : {}),
    // Only include pubpay tag filter if feedMode is 'pubpay'
    ...(params.feedMode === 'pubpay' ? { '#t': ['pubpay'] } : {})
  };
  return (await client.getEvents([filter])) as Kind1Event[];
};

export const ensurePosts = async (
  qc: QueryClient,
  client: NostrClient,
  params: PostsParams
): Promise<Kind1Event[]> => {
  return await qc.ensureQueryData({
    queryKey: postsKey(params),
    queryFn: () => fetchPosts(client, params),
    staleTime: 10_000
  });
};
