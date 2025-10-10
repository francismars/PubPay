import { QueryClient } from '@tanstack/react-query';
import { Kind1Event } from '@pubpay/shared-types';
import { NostrClient } from '../nostr/NostrClient';
export type PostsParams = {
    until?: number;
    limit?: number;
};
export declare const postsKey: (params: PostsParams) => (string | number | null)[];
export declare const fetchPosts: (client: NostrClient, params: PostsParams) => Promise<Kind1Event[]>;
export declare const ensurePosts: (qc: QueryClient, client: NostrClient, params: PostsParams) => Promise<Kind1Event[]>;
