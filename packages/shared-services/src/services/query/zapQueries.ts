import { QueryClient } from '@tanstack/react-query';
import { Kind9735Event } from '@pubpay/shared-types';
import { NostrClient } from '../nostr/NostrClient';

const sortUnique = (arr: string[]) => Array.from(new Set(arr)).sort();

export const zapsKey = (eventIds: string[]) => [
  'zaps',
  ...sortUnique(eventIds)
];

export const fetchZaps = async (
  client: NostrClient,
  eventIds: string[]
): Promise<Kind9735Event[]> => {
  if (eventIds.length === 0) return [];
  const unique = sortUnique(eventIds);
  return (await client.getEvents([
    { kinds: [9735], '#e': unique }
  ])) as Kind9735Event[];
};

export const ensureZaps = async (
  qc: QueryClient,
  client: NostrClient,
  eventIds: string[]
): Promise<Kind9735Event[]> => {
  return await qc.ensureQueryData({
    queryKey: zapsKey(eventIds),
    queryFn: () => fetchZaps(client, eventIds),
    staleTime: 30_000
  });
};
