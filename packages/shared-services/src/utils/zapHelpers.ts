import { Kind9735Event, Kind0Event, Kind1Event } from '@pubpay/shared-types';
import { parseZapDescription } from './nostrSchemas';
import { nip19 } from 'nostr-tools';
// @ts-ignore - bolt11 types are declared in bolt11.d.ts
import * as bolt11 from 'bolt11';

/**
 * Extract zap amount from bolt11 tag
 */
export function extractZapAmount(zap: Kind9735Event): number {
  const bolt11Tag = zap.tags.find(tag => tag[0] === 'bolt11');
  if (!bolt11Tag || !bolt11Tag[1]) return 0;
  
  try {
    const decoded = bolt11.decode(bolt11Tag[1]);
    return decoded.satoshis || 0;
  } catch {
    return 0;
  }
}

/**
 * Extract zap payer pubkey from zap event
 * Handles both named zaps (pubkey in description) and anonymous zaps (uses zap event pubkey)
 */
export function extractZapPayerPubkey(zap: Kind9735Event): string {
  const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
  
  if (descriptionTag && descriptionTag[1]) {
    try {
      const zapData = parseZapDescription(descriptionTag[1]);
      if (zapData?.pubkey) {
        return zapData.pubkey;
      }
    } catch {
      // Fall through to anonymous zap
    }
  }
  
  // Anonymous zap: use the zap event's pubkey
  return zap.pubkey;
}

/**
 * Extract zap content from description tag
 */
export function extractZapContent(zap: Kind9735Event): string {
  const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
  if (!descriptionTag || !descriptionTag[1]) return '';
  
  try {
    const zapData = parseZapDescription(descriptionTag[1]);
    if (zapData && 'content' in zapData && typeof zapData.content === 'string') {
      return zapData.content;
    }
  } catch {
    // Return empty string on error
  }
  
  return '';
}

/**
 * Extract all zap payer pubkeys from events and zaps
 * Includes zap-payer tags from note events and pubkeys from zap events
 */
export function extractZapPayerPubkeys(
  events: Kind1Event[],
  zaps: Kind9735Event[]
): Set<string> {
  const zapPayerPubkeys = new Set<string>();
  
  // Extract from note events (zap-payer tag)
  events.forEach(event => {
    const zapPayerTag = event.tags.find(tag => tag[0] === 'zap-payer' && tag[1]);
    if (zapPayerTag && zapPayerTag[1]) {
      zapPayerPubkeys.add(zapPayerTag[1]);
    }
  });
  
  // Extract from zap events
  zaps.forEach(zap => {
    const zapPayerPubkey = extractZapPayerPubkey(zap);
    if (zapPayerPubkey) {
      zapPayerPubkeys.add(zapPayerPubkey);
    }
  });
  
  return zapPayerPubkeys;
}

/**
 * Processed zap with all extracted data
 */
export interface ProcessedZap extends Kind9735Event {
  zapAmount: number;
  zapPayerPubkey: string;
  zapPayerPicture: string;
  zapPayerNpub: string;
  content: string;
}

/**
 * Process a single zap event with profile data
 */
export function processZap(
  zap: Kind9735Event,
  profiles: Map<string, Kind0Event>,
  genericUserIcon: string = '/images/gradient_color.gif'
): ProcessedZap {
  const zapAmount = extractZapAmount(zap);
  const zapPayerPubkey = extractZapPayerPubkey(zap);
  const zapContent = extractZapContent(zap);
  
  // Get zap payer profile
  const zapPayerProfile = profiles.get(zapPayerPubkey);
  let zapPayerPicture = genericUserIcon;
  
  if (zapPayerProfile && zapPayerProfile.content && zapPayerProfile.content !== '{}') {
    try {
      const profileData = JSON.parse(zapPayerProfile.content) as Record<string, any>;
      zapPayerPicture = profileData.picture || genericUserIcon;
    } catch {
      zapPayerPicture = genericUserIcon;
    }
  }
  
  const zapPayerNpub = zapPayerPubkey ? nip19.npubEncode(zapPayerPubkey) : '';
  
  return {
    ...zap,
    zapAmount,
    zapPayerPubkey,
    zapPayerPicture,
    zapPayerNpub,
    content: zapContent
  };
}

/**
 * Process multiple zaps with profile data
 */
export function processZaps(
  zaps: Kind9735Event[],
  profiles: Map<string, Kind0Event>,
  genericUserIcon: string = '/images/gradient_color.gif'
): ProcessedZap[] {
  return zaps.map(zap => processZap(zap, profiles, genericUserIcon));
}

