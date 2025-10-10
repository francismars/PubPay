import { z } from 'zod';
// Basic tuple-like tag: [key, ...values]
export const TagSchema = z.array(z.string()).refine(arr => arr.length >= 1, {
    message: 'tag must have at least a key'
});
export const BaseEventSchema = z.object({
    id: z.string().length(64),
    pubkey: z.string().length(64),
    kind: z.number(),
    content: z.string(),
    created_at: z.number().int(),
    tags: z.array(TagSchema),
    sig: z.string().optional()
});
export const Kind0Schema = BaseEventSchema.extend({ kind: z.literal(0) });
export const Kind1Schema = BaseEventSchema.extend({ kind: z.literal(1) });
export const Kind9735Schema = BaseEventSchema.extend({ kind: z.literal(9735) });
export function safeParseEvent(schema, data) {
    const res = schema.safeParse(data);
    return res.success ? res.data : null;
}
export function safeJson(input, fallback) {
    if (!input)
        return fallback;
    try {
        return JSON.parse(input);
    }
    catch {
        return fallback;
    }
}
export function getFirstTagValue(tags, key) {
    for (const tag of tags) {
        if (Array.isArray(tag) && tag[0] === key)
            return tag[1];
    }
    return undefined;
}
export function getAllTagValues(tags, key) {
    const values = [];
    for (const tag of tags) {
        if (Array.isArray(tag) && tag[0] === key && typeof tag[1] === 'string')
            values.push(tag[1]);
    }
    return values;
}
// Zap description payload per NIP-57 (minimal fields we use)
export const ZapDescriptionSchema = z.object({
    pubkey: z.string().length(64).optional(),
    id: z.string().length(64).optional()
});
export function parseZapDescription(input) {
    if (!input)
        return null;
    try {
        const data = JSON.parse(input);
        const res = ZapDescriptionSchema.safeParse(data);
        return res.success ? res.data : null;
    }
    catch {
        return null;
    }
}
