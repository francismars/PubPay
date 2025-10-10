import { QueryClient } from '@tanstack/react-query';
import { Kind0Event } from '@pubpay/shared-types';
import { NostrClient } from '../nostr/NostrClient';
export declare const ensureProfiles: (qc: QueryClient, client: NostrClient, pubkeys: string[]) => Promise<Map<string, Kind0Event>>;
