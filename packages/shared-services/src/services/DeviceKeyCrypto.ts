// DeviceKeyCrypto - AES-GCM encryption keyed by a random per-browser "device key".
//
// SECURITY NOTE: This is OBFUSCATION, not strong protection.
// The device key (`_dk`) lives in localStorage right next to the ciphertext, so
// anyone (or any script, e.g. via XSS) that can read localStorage can derive the
// same key and decrypt the data. It only protects against casual inspection of
// storage (shoulder-surfing devtools, plaintext greps of profile dumps, etc.).
//
// For real at-rest protection of private keys, use password mode
// (`AuthService.storeAuthData(..., password)`), which derives the key from a
// user-supplied password with PBKDF2 (600k iterations) and never persists it.
//
// The derivation parameters below are intentionally frozen so previously stored
// ciphertext keeps decrypting.

const DEVICE_KEY_STORAGE_KEY = '_dk';
const DEVICE_SALT = 'pubpay-device-salt';
const DEVICE_KEY_PBKDF2_ITERATIONS = 100000;

export interface EncryptedPayload {
  encrypted: string;
  salt: string;
  iv: string;
  hasPassword: boolean;
}

let cachedKey: { deviceKey: string; key: CryptoKey } | null = null;

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getOrCreateDeviceKey(): string {
  let deviceKey = localStorage.getItem(DEVICE_KEY_STORAGE_KEY);
  if (!deviceKey) {
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    deviceKey = toBase64(keyBytes);
    localStorage.setItem(DEVICE_KEY_STORAGE_KEY, deviceKey);
  }
  return deviceKey;
}

async function deriveDeviceEncryptionKey(): Promise<CryptoKey> {
  const deviceKey = getOrCreateDeviceKey();
  if (cachedKey && cachedKey.deviceKey === deviceKey) {
    return cachedKey.key;
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(deviceKey),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const salt = new Uint8Array(new TextEncoder().encode(DEVICE_SALT));
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer,
      iterations: DEVICE_KEY_PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  cachedKey = { deviceKey, key };
  return key;
}

export async function encryptWithDeviceKey(
  data: string
): Promise<EncryptedPayload> {
  const key = await deriveDeviceEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(data)
  );
  // Dummy salt keeps the structure identical to password-mode payloads.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    encrypted: toBase64(new Uint8Array(encrypted)),
    salt: toBase64(salt),
    iv: toBase64(iv),
    hasPassword: false
  };
}

export async function decryptWithDeviceKey(
  payload: EncryptedPayload
): Promise<string> {
  const key = await deriveDeviceEncryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(payload.iv) },
    key,
    fromBase64(payload.encrypted)
  );
  return new TextDecoder().decode(decrypted);
}

export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.encrypted === 'string' &&
    typeof v.iv === 'string' &&
    typeof v.salt === 'string'
  );
}
