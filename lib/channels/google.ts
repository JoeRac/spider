/**
 * Google OAuth adapter — shared between Google My Business and YouTube.
 *
 * Both channels are Google products and use the same auth flow; they only
 * differ in scopes + which provider id we extract on callback. To avoid
 * duplication we expose a factory and let the per-channel modules pick
 * their scope set.
 *
 * Env requirements (set both for either channel to work):
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 */
import type { ChannelAdapter, AuthUrlContext, ExchangeCodeContext, ExchangeCodeResult, RefreshContext } from './types';
import type { Channel } from '@/lib/db/schema';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type GoogleAdapterOpts = {
  channel: Channel;
  label: string;
  scopes: string[];
  /** Called after a successful token exchange to derive externalIds — e.g.
   *  resolve the YouTube channel id, or the GMB account id. */
  resolveIds(tokens: { access_token: string }): Promise<Record<string, string>>;
};

export function makeGoogleAdapter(opts: GoogleAdapterOpts): ChannelAdapter {
  return {
    channel: opts.channel,
    label: opts.label,
    kind: 'oauth',
    scopes: opts.scopes,

    isConfigured() {
      return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
    },

    buildAuthUrl(ctx: AuthUrlContext): string {
      const url = new URL(AUTH_URL);
      url.searchParams.set('client_id', process.env.GOOGLE_OAUTH_CLIENT_ID ?? '');
      url.searchParams.set('redirect_uri', ctx.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', opts.scopes.join(' '));
      // offline + prompt=consent guarantees a refresh_token even on
      // re-consent (Google only ships one on first grant otherwise).
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set('include_granted_scopes', 'true');
      url.searchParams.set('state', ctx.state);
      return url.toString();
    },

    async exchangeCode(ctx: ExchangeCodeContext): Promise<ExchangeCodeResult> {
      const body = new URLSearchParams({
        code: ctx.code,
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
        redirect_uri: ctx.redirectUri,
        grant_type: 'authorization_code',
      });
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) throw new Error(`Google token exchange ${res.status}: ${await res.text()}`);
      const tokens = await res.json() as {
        access_token: string;
        expires_in: number;
        refresh_token?: string;
        scope: string;
        token_type: string;
      };
      const externalIds = await opts.resolveIds(tokens);
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      return {
        credentials: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? null,
          token_type: tokens.token_type,
          scope: tokens.scope,
          expires_at: expiresAt.toISOString(),
        },
        externalIds,
        expiresAt,
      };
    },

    async refresh(ctx: RefreshContext): Promise<ExchangeCodeResult> {
      const creds = ctx.credentials as { refresh_token?: string };
      if (!creds.refresh_token) throw new Error('No refresh_token on file');
      const body = new URLSearchParams({
        refresh_token: creds.refresh_token,
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
      });
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) throw new Error(`Google refresh ${res.status}: ${await res.text()}`);
      const tokens = await res.json() as { access_token: string; expires_in: number; scope: string; token_type: string };
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      return {
        credentials: {
          ...(ctx.credentials as Record<string, unknown>),
          access_token: tokens.access_token,
          scope: tokens.scope,
          token_type: tokens.token_type,
          expires_at: expiresAt.toISOString(),
        },
        externalIds: {},
        expiresAt,
      };
    },

    async disconnect(ctx: RefreshContext): Promise<void> {
      const creds = ctx.credentials as { refresh_token?: string; access_token?: string };
      const token = creds.refresh_token ?? creds.access_token;
      if (!token) return;
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: 'POST',
      }).catch(() => { /* best effort */ });
    },
  };
}
