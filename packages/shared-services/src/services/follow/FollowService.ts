import * as NostrTools from 'nostr-tools';
import { ensureProfiles } from '../query/profileQueries';
import { getQueryClient } from '../query/queryClient';
import { AuthService } from '../AuthService';

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
        const pTags =
          (event as any).tags?.filter((t: string[]) => t[0] === 'p') || [];
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

  static async isFollowing(
    nostrClient: any,
    authUserPubkey: string,
    targetPubkey: string
  ): Promise<boolean> {
    if (!nostrClient || !authUserPubkey || !targetPubkey) return false;
    try {
      const kind3 = await nostrClient.getEvents([
        { kinds: [3], authors: [authUserPubkey], limit: 1 }
      ]);
      const pTags = (kind3?.[0]?.tags || [])
        .filter((t: any[]) => t[0] === 'p')
        .map((t: any[]) => t[1]);
      return pTags.includes(targetPubkey);
    } catch {
      return false;
    }
  }

  private static async buildUpdatedContactsTags(
    nostrClient: any,
    authUserPubkey: string,
    mutate: (existingPTags: string[][]) => string[][]
  ): Promise<string[][]> {
    const existing = await nostrClient.getEvents([
      { kinds: [3], authors: [authUserPubkey], limit: 1 }
    ]);
    const baseTags: string[][] = (existing?.[0]?.tags || []).filter(
      (t: any[]) => Array.isArray(t) && t[0] === 'p'
    );
    return mutate(baseTags);
  }

  static async follow(
    nostrClient: any,
    authUserPubkey: string,
    targetPubkey: string
  ): Promise<boolean> {
    if (!nostrClient || !authUserPubkey || !targetPubkey) return false;

    const newTags = await this.buildUpdatedContactsTags(
      nostrClient,
      authUserPubkey,
      base => {
        if (base.find(t => t[1] === targetPubkey)) return base;
        return [...base, ['p', targetPubkey]];
      }
    );

    const event: any = {
      kind: 3,
      created_at: Math.floor(Date.now() / 1000),
      tags: newTags,
      content: ''
    };

    const { method, privateKey } = AuthService.getStoredAuthData();
    let signed: any;
    if (method === 'extension') {
      if ((window as any).nostr)
        signed = await (window as any).nostr.signEvent(event);
    } else if (method === 'nsec' && privateKey) {
      const decoded = NostrTools.nip19.decode(privateKey);
      signed = NostrTools.finalizeEvent(event, decoded.data as Uint8Array);
    } else if (method === 'externalSigner') {
      alert('Following via external signer is not yet supported.');
      return false;
    }
    if (!signed) return false;
    await nostrClient.publishEvent(signed);
    return true;
  }

  static async unfollow(
    nostrClient: any,
    authUserPubkey: string,
    targetPubkey: string
  ): Promise<boolean> {
    if (!nostrClient || !authUserPubkey || !targetPubkey) return false;

    const newTags = await this.buildUpdatedContactsTags(
      nostrClient,
      authUserPubkey,
      base => {
        return base.filter(t => t[1] !== targetPubkey);
      }
    );

    const event: any = {
      kind: 3,
      created_at: Math.floor(Date.now() / 1000),
      tags: newTags,
      content: ''
    };

    const { method, privateKey } = AuthService.getStoredAuthData();
    let signed: any;
    if (method === 'extension') {
      if ((window as any).nostr)
        signed = await (window as any).nostr.signEvent(event);
    } else if (method === 'nsec' && privateKey) {
      const decoded = NostrTools.nip19.decode(privateKey);
      signed = NostrTools.finalizeEvent(event, decoded.data as Uint8Array);
    } else if (method === 'externalSigner') {
      alert('Unfollow via external signer is not yet supported.');
      return false;
    }
    if (!signed) return false;
    await nostrClient.publishEvent(signed);
    return true;
  }
}

export default FollowService;
