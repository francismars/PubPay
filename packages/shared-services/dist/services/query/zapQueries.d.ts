import { QueryClient } from '@tanstack/react-query';
import { Kind9735Event } from '@pubpay/shared-types';
import { NostrClient } from '../nostr/NostrClient';
export declare const zapsKey: (eventIds: string[]) => string[];
export declare const fetchZaps: (client: NostrClient, eventIds: string[]) => Promise<Kind9735Event[]>;
export declare const ensureZaps: (qc: QueryClient, client: NostrClient, eventIds: string[]) => Promise<Kind9735Event[]>;
