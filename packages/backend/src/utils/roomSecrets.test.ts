import { describe, expect, it } from 'vitest';
import {
  generateAdminToken,
  generateRoomId,
  hashSecret,
  verifySecret
} from './roomSecrets.js';

describe('roomSecrets', () => {
  it('hashSecret + verifySecret round-trip', async () => {
    const hash = await hashSecret('correct-horse');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifySecret('correct-horse', hash)).toBe(true);
    expect(await verifySecret('wrong', hash)).toBe(false);
  });

  it('verifySecret accepts legacy plaintext for migration', async () => {
    expect(await verifySecret('legacy-pass', 'legacy-pass')).toBe(true);
    expect(await verifySecret('nope', 'legacy-pass')).toBe(false);
  });

  it('verifySecret rejects empty', async () => {
    expect(await verifySecret('', 'scrypt$x$y')).toBe(false);
    expect(await verifySecret('x', undefined)).toBe(false);
  });

  it('generateAdminToken / generateRoomId shape', () => {
    const token = generateAdminToken();
    expect(token.length).toBeGreaterThan(20);
    const id = generateRoomId();
    expect(id.length).toBeGreaterThanOrEqual(6);
    expect(id.length).toBeLessThanOrEqual(10);
  });
});
