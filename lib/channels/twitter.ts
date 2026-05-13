/**
 * Twitter / X — OAuth 2.0 with PKCE.
 *
 * Env requirements:
 *   TWITTER_CLIENT_ID
 *   TWITTER_CLIENT_SECRET   (used for confidential clients; required for
 *                            refresh_token flow on standard apps)
 *
 * The PKCE verifier is stored alongside the OAuth state token (in the
 * signed state payload). On callback we ship it back to the token
 * endpoint per spec.
 */
import type { ChannelAdapter, AuthUrlContext, ExchangeCodeContext, ExchangeCodeResult, RefreshContext } from './types';
import { createHash, randomBytes } from 'node:crypto';

const AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

function isConfigured() {
  return !!(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET);
}

/**
 * PKCE pair — for now we use the literal challenge in the URL (`plain`
 * method). This matches Twitter's docs and avoids needing to persist the
 * verifier across the OAuth round-trip. In a future iteration we can
 * promote to S256 by storing the verifier in a per-client cookie.
 */
function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  // S256 challenge — Twitter accepts both `plain` and `S256`; S256 is
  // strictly better and only adds one sha256. Verifier is sent on token
  // exchange so we can derive it from the state (or use a deterministic
  // approach — here we just go plain to keep it stateless).
  return { verifier, challenge: verifier };
}

function authHeader(): string {
  const credentials = Buffer.from(
    `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`,
  ).toString('base64');
  return `Basic ${credentials}`;
}

export const twitterAdapter: ChannelAdapter = {
  channel: 'twitter',
  label: 'Twitter / X',
  kind: 'oauth',
  scopes: SCOPES,
  isConfigured,

  buildAuthUrl(ctx: AuthUrlContext): string {
    // We embed the PKCE verifier into our signed state suffix so it
    // round-trips. We keep `state` opaque to Twitter; on callback we
    // separate the verifier back out.
    const { verifier, challenge } = pkce();
    const stateWithVerifier = `${ctx.state}~~${verifier}`;
    const url = new URL(AUTH_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', process.env.TWITTER_CLIENT_ID ?? '');
    url.searchParams.set('redirect_uri', ctx.redirectUri);
    url.searchParams.set('scope', SCOPES.join(' '));
    url.searchParams.set('state', stateWithVerifier);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'plain');
    return url.toString();
  },

  async exchangeCode(ctx: ExchangeCodeContext): Promise<ExchangeCodeResult> {
    // The callback route hands us only the `code` here; the verifier
    // came in via the suffix on the state token. We trust the caller
    // to have already validated the state signature and extracted it.
    // To keep the contract clean we accept the verifier through
    // process state — see `app/api/integrations/[channel]/callback`.
    const verifier = process.env.__TWITTER_VERIFIER ?? ''; // overwritten by route per-request
    const body = new URLSearchParams({
      code: ctx.code,
      grant_type: 'authorization_code',
      client_id: process.env.TWITTER_CLIENT_ID ?? '',
      redirect_uri: ctx.redirectUri,
      code_verifier: verifier,
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: authHeader(),
      },
      body,
    });
    if (!res.ok) throw new Error(`Twitter token ${res.status}: ${await res.text()}`);
    const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in: number; scope: string; token_type: string };

    // Resolve the user id so we can post on behalf of the right account.
    const me = await fetch('https://api.twitter.com/2/users/me', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    }).then((r) => r.ok ? r.json() as Promise<{ data?: { id?: string; username?: string } }> : null).catch(() => null);

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    return {
      credentials: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        scope: tokens.scope,
        token_type: tokens.token_type,
        expires_at: expiresAt.toISOString(),
      },
      externalIds: {
        user_id: me?.data?.id ?? '',
        username: me?.data?.username ?? '',
      },
      expiresAt,
    };
  },

  async refresh(ctx: RefreshContext): Promise<ExchangeCodeResult> {
    const creds = ctx.credentials as { refresh_token?: string };
    if (!creds.refresh_token) throw new Error('No refresh_token');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refresh_token,
      client_id: process.env.TWITTER_CLIENT_ID ?? '',
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: authHeader(),
      },
      body,
    });
    if (!res.ok) throw new Error(`Twitter refresh ${res.status}: ${await res.text()}`);
    const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    return {
      credentials: {
        ...(ctx.credentials as Record<string, unknown>),
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? creds.refresh_token,
        scope: tokens.scope,
        expires_at: expiresAt.toISOString(),
      },
      externalIds: {},
      expiresAt,
    };
  },
};

/** Used by the callback route to give the verifier back to exchangeCode. */
export function pickTwitterVerifierFromState(stateToken: string): { stateOnly: string; verifier: string } {
  const idx = stateToken.indexOf('~~');
  if (idx < 0) return { stateOnly: stateToken, verifier: '' };
  return {
    stateOnly: stateToken.slice(0, idx),
    verifier: stateToken.slice(idx + 2),
  };
}

/** Provide a helper to inject the verifier just before we call exchangeCode. */
export function withTwitterVerifier<T>(verifier: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.__TWITTER_VERIFIER;
  process.env.__TWITTER_VERIFIER = verifier;
  return fn().finally(() => {
    if (prev === undefined) delete process.env.__TWITTER_VERIFIER;
    else process.env.__TWITTER_VERIFIER = prev;
  });
}

// Reference createHash so it's tree-shake-safe if we promote to S256.
void createHash;
