import * as NostrTools from 'nostr-tools';
import { ensureProfiles } from '../query/profileQueries';
import { getQueryClient } from '../query/queryClient';

export type FollowSuggestion = {
  pubkey: string;
  npub: string;
  displayName: string;
  picture?: string;
};

export class FollowService {
  static async getFollowSuggestions(
    nostrClient: any,
    userPubkey: string
  ): Promise<FollowSuggestion[]> {
    if (!nostrClient || !userPubkey) return [];
    try {
      const kind3Events = await nostrClient.getEvents([
        { kinds: [3], authors: [userPubkey] }
      ]);
      const followPubkeys: string[] = [];
      for (const event of kind3Events) {
        const pTags = (event as any).tags?.filter((t: string[]) => t[0] === 'p') || [];
        pTags.forEach((t: string[]) => t[1] && followPubkeys.push(t[1]));
      }
      const unique = Array.from(new Set(followPubkeys));
      if (unique.length === 0) return [];

      const profileMap = await ensureProfiles(
        getQueryClient(),
        nostrClient,
        unique
      );
      return Array.from(profileMap.values() as Iterable<any>).map((p: any) => {
        const npub = NostrTools.nip19.npubEncode(p.pubkey);
        let displayName = npub;
        try {
          const content = JSON.parse(p.content || '{}');
          displayName = content.display_name || content.name || npub;
          return {
            pubkey: p.pubkey,
            npub,
            displayName,
            picture: content.picture as string | undefined
          };
        } catch {
          return { pubkey: p.pubkey, npub, displayName };
        }
      });
    } catch (e) {
      console.warn('FollowService.getFollowSuggestions error:', e);
      return [];
    }
  }
}

export default FollowService;


