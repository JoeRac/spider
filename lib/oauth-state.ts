/**
 * HMAC-signed OAuth `state` parameter.
 *
 * Why a signed state instead of a session cookie:
 *   - Stateless: any Spider instance can validate the callback. No need
 *     to share session storage between regions.
 *   - The state encodes `clientId` and `channel`, so the callback knows
 *     exactly which integration row to write without a separate lookup.
 *   - Expiry is enforced, so a stale callback URL (e.g. user reopens an
 *     old browser tab) gets rejected cleanly.
 *
 * Wire format: base64url(JSON({clientId, channel, exp, nonce})).<hex hmac>
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TTL_MS = 10 * 60 * 1000; // 10 minutes — plenty for an OAuth round trip

type OAuthState = {
  clientId: string;
  channel: string;
  exp: number;
  nonce: string;
};

function secret(): string {
  return (
    process.env.OAUTH_STATE_SECRET ??
    process.env.INTEGRATION_ENCRYPTION_KEY ??
    'spider-dev-oauth-state-secret'
  );
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

function b64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}
function b64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function encodeState(input: { clientId: string; channel: string }): string {
  const state: OAuthState = {
    clientId: input.clientId,
    channel: input.channel,
    exp: Date.now() + TTL_MS,
    nonce: randomBytes(16).toString('hex'),
  };
  const payload = b64urlEncode(JSON.stringify(state));
  return `${payload}.${sign(payload)}`;
}

export function decodeState(token: string): OAuthState {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Malformed OAuth state');
  const [payload, sig] = parts as [string, string];
  const expected = sign(payload);
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('OAuth state signature mismatch');
  }
  const decoded = JSON.parse(b64urlDecode(payload)) as OAuthState;
  if (typeof decoded.exp !== 'number' || decoded.exp < Date.now()) {
    throw new Error('OAuth state expired');
  }
  if (!decoded.clientId || !decoded.channel) {
    throw new Error('OAuth state missing fields');
  }
  return decoded;
}
