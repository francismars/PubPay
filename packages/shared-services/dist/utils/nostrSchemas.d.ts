import { z } from 'zod';
export declare const TagSchema: z.ZodArray<z.ZodString>;
export type Tag = z.infer<typeof TagSchema>;
export declare const BaseEventSchema: z.ZodObject<{
    id: z.ZodString;
    pubkey: z.ZodString;
    kind: z.ZodNumber;
    content: z.ZodString;
    created_at: z.ZodNumber;
    tags: z.ZodArray<z.ZodArray<z.ZodString>>;
    sig: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type BaseEvent = z.infer<typeof BaseEventSchema>;
export declare const Kind0Schema: z.ZodObject<{
    id: z.ZodString;
    pubkey: z.ZodString;
    content: z.ZodString;
    created_at: z.ZodNumber;
    tags: z.ZodArray<z.ZodArray<z.ZodString>>;
    sig: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<0>;
}, z.core.$strip>;
export type Kind0Event = z.infer<typeof Kind0Schema>;
export declare const Kind1Schema: z.ZodObject<{
    id: z.ZodString;
    pubkey: z.ZodString;
    content: z.ZodString;
    created_at: z.ZodNumber;
    tags: z.ZodArray<z.ZodArray<z.ZodString>>;
    sig: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<1>;
}, z.core.$strip>;
export type Kind1Event = z.infer<typeof Kind1Schema>;
export declare const Kind9735Schema: z.ZodObject<{
    id: z.ZodString;
    pubkey: z.ZodString;
    content: z.ZodString;
    created_at: z.ZodNumber;
    tags: z.ZodArray<z.ZodArray<z.ZodString>>;
    sig: z.ZodOptional<z.ZodString>;
    kind: z.ZodLiteral<9735>;
}, z.core.$strip>;
export type Kind9735Event = z.infer<typeof Kind9735Schema>;
export declare function safeParseEvent<T extends BaseEvent>(schema: z.ZodType<T>, data: unknown): T | null;
export declare function safeJson<T = unknown>(input: string | null | undefined, fallback: T): T;
export declare function getFirstTagValue(tags: string[][], key: string): string | undefined;
export declare function getAllTagValues(tags: string[][], key: string): string[];
export declare const ZapDescriptionSchema: z.ZodObject<{
    pubkey: z.ZodOptional<z.ZodString>;
    id: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ZapDescription = z.infer<typeof ZapDescriptionSchema>;
export declare function parseZapDescription(input: string | undefined): ZapDescription | null;
