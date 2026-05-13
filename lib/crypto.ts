/**
 * AES-256-GCM credential vault.
 *
 * Every OAuth token, refresh token, and channel secret stored in
 * `integrations.credentials` flows through `encryptJSON` / `decryptJSON`.
 *
 * Key management:
 *   - `INTEGRATION_ENCRYPTION_KEY` env var holds a hex-encoded 32-byte key.
 *   - If absent in development, we derive a *non-secret* throwaway key so
 *     local devs aren't blocked. Production reads from env exclusively;
 *     server boots fine without it, but any encrypt/decrypt call throws.
 *
 * Wire format (each ciphertext is one base64 string):
 *   v1.<base64(iv ‖ authTag ‖ ciphertext)>
 *
 * Why a version prefix: lets us swap algorithm or key derivation without
 * a destructive backfill — old rows decrypt with the v1 path, new rows
 * encrypt under v2, and we migrate lazily on next write.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function loadKey(): Buffer {
  const hex = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (hex) {
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error('INTEGRATION_ENCRYPTION_KEY must be 64 hex chars (32 bytes).');
    }
    return Buffer.from(hex, 'hex');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('INTEGRATION_ENCRYPTION_KEY is required in production.');
  }
  // Dev fallback — derive a stable key from a well-known string so restarts
  // don't lose access to existing rows. Not secret; not for production.
  return createHash('sha256').update('spider:dev:credential-vault').digest();
}

let cachedKey: Buffer | null = null;
function key(): Buffer {
  return (cachedKey ??= loadKey());
}

export function encryptString(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${Buffer.concat([iv, tag, enc]).toString('base64')}`;
}

export function decryptString(payload: string): string {
  if (!payload.startsWith('v1.')) {
    throw new Error(`Unknown credential vault version: ${payload.slice(0, 4)}…`);
  }
  const raw = Buffer.from(payload.slice(3), 'base64');
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export function encryptJSON<T>(value: T): string {
  return encryptString(JSON.stringify(value));
}

export function decryptJSON<T = unknown>(payload: string): T {
  return JSON.parse(decryptString(payload)) as T;
}

/**
 * Generates a fresh INTEGRATION_ENCRYPTION_KEY value — print and paste into
 * `vercel env add`. Only used by ops; not at runtime.
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex');
}
