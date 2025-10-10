// Validation utilities
import { ZAP_AMOUNTS, EVENT_KINDS } from './constants';
export const isValidPublicKey = (pubkey) => {
    return /^[0-9a-f]{64}$/i.test(pubkey);
};
export const isValidPrivateKey = (privateKey) => {
    return /^[0-9a-f]{64}$/i.test(privateKey);
};
export const isValidEventId = (eventId) => {
    return /^[0-9a-f]{64}$/i.test(eventId);
};
export const isValidNpub = (npub) => {
    return npub.startsWith('npub1') && npub.length > 50;
};
export const isValidNsec = (nsec) => {
    return nsec.startsWith('nsec1') && nsec.length > 50;
};
export const isValidNevent = (nevent) => {
    return nevent.startsWith('nevent1') && nevent.length > 50;
};
export const isValidNaddr = (naddr) => {
    return naddr.startsWith('naddr1') && naddr.length > 50;
};
export const isValidNprofile = (nprofile) => {
    return nprofile.startsWith('nprofile1') && nprofile.length > 50;
};
export const isValidZapAmount = (amount) => {
    return amount >= ZAP_AMOUNTS.MIN && amount <= ZAP_AMOUNTS.MAX;
};
export const isValidEventKind = (kind) => {
    return Object.values(EVENT_KINDS).includes(kind);
};
export const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    }
    catch {
        return false;
    }
};
export const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
export const isValidHexColor = (color) => {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
};
export const isValidYouTubeId = (id) => {
    return /^[a-zA-Z0-9_-]{11}$/.test(id);
};
export const sanitizeString = (str) => {
    return str.replace(/[<>\"'&]/g, (match) => {
        const escapeMap = {
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            '\'': '&#x27;',
            '&': '&amp;'
        };
        return escapeMap[match] || match;
    });
};
export const validateEventData = (event) => {
    const errors = [];
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
