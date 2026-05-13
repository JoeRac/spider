/**
 * TikTok for Developers — Login Kit + Content Posting API.
 *
 * Env requirements:
 *   TIKTOK_CLIENT_KEY
 *   TIKTOK_CLIENT_SECRET
 */
import type { ChannelAdapter, AuthUrlContext, ExchangeCodeContext, ExchangeCodeResult, RefreshContext } from './types';

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const SCOPES = ['user.info.basic', 'video.publish', 'video.upload'];

export const tiktokAdapter: ChannelAdapter = {
  channel: 'tiktok',
  label: 'TikTok',
  kind: 'oauth',
  scopes: SCOPES,

  isConfigured() {
    return !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
  },

  buildAuthUrl(ctx: AuthUrlContext): string {
    const url = new URL(AUTH_URL);
    url.searchParams.set('client_key', process.env.TIKTOK_CLIENT_KEY ?? '');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPES.join(','));
    url.searchParams.set('redirect_uri', ctx.redirectUri);
    url.searchParams.set('state', ctx.state);
    return url.toString();
  },

  async exchangeCode(ctx: ExchangeCodeContext): Promise<ExchangeCodeResult> {
    const body = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
      client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
      code: ctx.code,
      grant_type: 'authorization_code',
      redirect_uri: ctx.redirectUri,
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`TikTok token ${res.status}: ${await res.text()}`);
    const tokens = await res.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      refresh_expires_in?: number;
      scope: string;
      open_id?: string;
    };
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    return {
      credentials: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        scope: tokens.scope,
        expires_at: expiresAt.toISOString(),
        refresh_expires_at: tokens.refresh_expires_in
          ? new Date(Date.now() + tokens.refresh_expires_in * 1000).toISOString()
          : null,
      },
      externalIds: { open_id: tokens.open_id ?? '' },
      expiresAt,
    };
  },

  async refresh(ctx: RefreshContext): Promise<ExchangeCodeResult> {
    const creds = ctx.credentials as { refresh_token?: string };
    if (!creds.refresh_token) throw new Error('No refresh_token');
    const body = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
      client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token: creds.refresh_token,
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`TikTok refresh ${res.status}: ${await res.text()}`);
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
