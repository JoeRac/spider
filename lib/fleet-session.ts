const SECRET = process.env.FLEET_SESSION_SECRET ?? '';
const APP_NAME = 'spider' as const;

export const FLEET_SESSION_COOKIE = 'fleet_session';
export const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

export function silverbackLoginUrl(absoluteNextUrl: string): string {
  const base = process.env.SILVERBACK_BASE_URL || 'https://silverback-eight.vercel.app';
  const u = new URL('/login', base.replace(/\/+$/, ''));
  u.searchParams.set('next', absoluteNextUrl);
  return u.toString();
}

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlFromString(s: string): string {
  return b64urlFromBytes(new TextEncoder().encode(s));
}
function b64urlToString(s: string): string | null {
  try {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
    return atob(padded);
  } catch { return null; }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
}

async function signRaw(payload: Record<string, unknown>): Promise<string> {
  if (!SECRET) throw new Error('FLEET_SESSION_SECRET not configured');
  const body = b64urlFromString(JSON.stringify(payload));
  const key = await importHmacKey(SECRET);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return `${body}.${b64urlFromBytes(sig)}`;
}

async function verifyRaw<T>(token: string | null | undefined): Promise<T | null> {
  if (!token || !SECRET) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  try {
    const key = await importHmacKey(SECRET);
    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body!)));
    const expectedStr = b64urlFromBytes(expected);
    if (expectedStr.length !== sig!.length) return null;
    let mismatch = 0;
    for (let i = 0; i < expectedStr.length; i++) mismatch |= expectedStr.charCodeAt(i) ^ sig!.charCodeAt(i);
    if (mismatch !== 0) return null;
    const json = b64urlToString(body!);
    if (!json) return null;
    const payload = JSON.parse(json) as T;
    const exp = (payload as { exp?: number }).exp;
    if (typeof exp !== 'number') return null;
    if (exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

export type HandoffPayload = { v: 1; sub: string; aud: string; iat: number; exp: number };
export type SessionPayload = { v: 1; sub: string; iat: number; exp: number };

export async function verifyHandoff(token: string | null | undefined): Promise<HandoffPayload | null> {
  const p = await verifyRaw<HandoffPayload>(token);
  if (!p || p.aud !== APP_NAME) return null;
  return p;
}

export async function signSession(sub: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signRaw({ v: 1, sub, iat: now, exp: now + SESSION_TTL_SECONDS });
}

export async function verifySession(cookie: string | null | undefined): Promise<SessionPayload | null> {
  return verifyRaw<SessionPayload>(cookie);
}
