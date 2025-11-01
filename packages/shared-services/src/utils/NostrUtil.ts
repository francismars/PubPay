import * as NostrTools from 'nostr-tools';

export const NostrUtil = {
  /**
   * Accepts '@npub...' or 'npub...' and returns hex pubkey if valid
   */
  parseNpub(input: string): { ok: boolean; hex?: string; error?: string } {
    try {
      if (!input || typeof input !== 'string')
        return { ok: false, error: 'empty' };
      const clean = input.trim().replace(/^@/, '');
      const decoded = NostrTools.nip19.decode(clean);
      if (decoded.type !== 'npub' || typeof decoded.data !== 'string') {
        return { ok: false, error: 'not npub' };
      }
      return { ok: true, hex: decoded.data as string };
    } catch (e) {
      return { ok: false, error: 'decode failed' };
    }
  }
};

export default NostrUtil;
