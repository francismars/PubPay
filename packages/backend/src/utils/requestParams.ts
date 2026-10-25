import type { Request } from 'express';

/**
 * Express 5 types route params as `string | string[]`.
 * Normalize to a single string for handlers that expect one segment.
 */
export function asStringParam(
  value: string | string[] | undefined
): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function routeParam(req: Request, name: string): string {
  return asStringParam(req.params[name]);
}

export function asOptionalString(
  value: unknown
): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}
