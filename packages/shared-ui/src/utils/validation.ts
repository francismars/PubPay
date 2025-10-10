// Validation utilities

import { ZAP_AMOUNTS, EVENT_KINDS } from './constants';

export const isValidPublicKey = (pubkey: string): boolean => {
  return /^[0-9a-f]{64}$/i.test(pubkey);
};

export const isValidPrivateKey = (privateKey: string): boolean => {
  return /^[0-9a-f]{64}$/i.test(privateKey);
};

export const isValidEventId = (eventId: string): boolean => {
  return /^[0-9a-f]{64}$/i.test(eventId);
};

export const isValidNpub = (npub: string): boolean => {
  return npub.startsWith('npub1') && npub.length > 50;
};

export const isValidNsec = (nsec: string): boolean => {
  return nsec.startsWith('nsec1') && nsec.length > 50;
};

export const isValidNevent = (nevent: string): boolean => {
  return nevent.startsWith('nevent1') && nevent.length > 50;
};

export const isValidNaddr = (naddr: string): boolean => {
  return naddr.startsWith('naddr1') && naddr.length > 50;
};

export const isValidNprofile = (nprofile: string): boolean => {
  return nprofile.startsWith('nprofile1') && nprofile.length > 50;
};

export const isValidZapAmount = (amount: number): boolean => {
  return amount >= ZAP_AMOUNTS.MIN && amount <= ZAP_AMOUNTS.MAX;
};

export const isValidEventKind = (kind: number): boolean => {
  return Object.values(EVENT_KINDS).includes(kind as any);
};

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidHexColor = (color: string): boolean => {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
};

export const isValidYouTubeId = (id: string): boolean => {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
};

export const sanitizeString = (str: string): string => {
  return str.replace(/[<>\"'&]/g, (match) => {
    const escapeMap: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&#x27;',
      '&': '&amp;'
    };
    return escapeMap[match] || match;
  });
};

export const validateEventData = (event: any): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!event.id || !isValidEventId(event.id)) {
    errors.push('Invalid event ID');
  }

  if (!event.pubkey || !isValidPublicKey(event.pubkey)) {
    errors.push('Invalid public key');
  }

  if (!event.created_at || typeof event.created_at !== 'number') {
    errors.push('Invalid created_at timestamp');
  }

  if (!event.kind || !isValidEventKind(event.kind)) {
    errors.push('Invalid event kind');
  }

  if (!Array.isArray(event.tags)) {
    errors.push('Invalid tags format');
  }

  if (typeof event.content !== 'string') {
    errors.push('Invalid content format');
  }

  if (!event.sig || !isValidEventId(event.sig)) {
    errors.push('Invalid signature');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
