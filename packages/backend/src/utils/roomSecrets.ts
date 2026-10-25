import crypto from 'crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;

function scryptDerive(plain: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      plain,
      salt,
      KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, derived) => {
        if (err) reject(err);
        else resolve(derived as Buffer);
      }
    );
  });
}

/** Format: scrypt$<saltB64>$<hashB64> */
export async function hashSecret(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scryptDerive(plain, salt);
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifySecret(
  plain: string,
  stored: string | undefined
): Promise<boolean> {
  if (!stored || !plain) return false;

  // Legacy plaintext passwords (pre-hash migration)
  if (!stored.startsWith('scrypt$')) {
    const a = Buffer.from(plain);
    const b = Buffer.from(stored);
    if (a.length !== b.length) {
      crypto.timingSafeEqual(a, a);
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }

  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const salt = Buffer.from(parts[1]!, 'base64url');
  const expected = Buffer.from(parts[2]!, 'base64url');
  const derived = await scryptDerive(plain, salt);
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function generateAdminToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateRoomId(): string {
  return crypto
    .randomBytes(6)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 10);
}
