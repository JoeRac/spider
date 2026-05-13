/**
 * Facebook + Instagram share the same Meta OAuth app.
 *
 * Env requirements:
 *   FACEBOOK_APP_ID
 *   FACEBOOK_APP_SECRET
 *
 * Strategy:
 *   - Operator authorises the Facebook user.
 *   - We exchange short-lived user token → long-lived (60-day) user token.
 *   - We list pages and store the first page's page-access-token (which
 *     never expires for as long as the user-access stays valid).
 *   - For Instagram, we resolve the IG business account linked to that page.
 */
import type { ChannelAdapter, AuthUrlContext, ExchangeCodeContext, ExchangeCodeResult } from './types';
import type { Channel } from '@/lib/db/schema';

const GRAPH = 'https://graph.facebook.com/v21.0';
const OAUTH = 'https://www.facebook.com/v21.0/dialog/oauth';

function isConfigured() {
  return !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

async function exchangeUserCode(ctx: ExchangeCodeContext): Promise<{ access_token: string }> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set('client_id', process.env.FACEBOOK_APP_ID ?? '');
  url.searchParams.set('client_secret', process.env.FACEBOOK_APP_SECRET ?? '');
  url.searchParams.set('redirect_uri', ctx.redirectUri);
  url.searchParams.set('code', ctx.code);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FB code exchange ${res.status}: ${await res.text()}`);
  return (await res.json()) as { access_token: string };
}

async function exchangeForLongLived(shortToken: string): Promise<{ access_token: string; expires_in?: number }> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', process.env.FACEBOOK_APP_ID ?? '');
  url.searchParams.set('client_secret', process.env.FACEBOOK_APP_SECRET ?? '');
  url.searchParams.set('fb_exchange_token', shortToken);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FB long-lived exchange ${res.status}: ${await res.text()}`);
  return await res.json() as { access_token: string; expires_in?: number };
}

async function listPages(userAccessToken: string): Promise<Array<{ id: string; name: string; access_token: string }>> {
  const url = new URL(`${GRAPH}/me/accounts`);
  url.searchParams.set('access_token', userAccessToken);
  url.searchParams.set('fields', 'id,name,access_token');
  const res = await fetch(url);
  if (!res.ok) return [];
  const body = await res.json() as { data?: Array<{ id: string; name: string; access_token: string }> };
  return body.data ?? [];
}

async function resolveInstagramAccount(pageId: string, pageAccessToken: string): Promise<string | null> {
  const url = new URL(`${GRAPH}/${pageId}`);
  url.searchParams.set('fields', 'instagram_business_account');
  url.searchParams.set('access_token', pageAccessToken);
  const res = await fetch(url);
  if (!res.ok) return null;
  const body = await res.json() as { instagram_business_account?: { id?: string } };
  return body.instagram_business_account?.id ?? null;
}

function authUrl(scopes: string[], ctx: AuthUrlContext): string {
  const url = new URL(OAUTH);
  url.searchParams.set('client_id', process.env.FACEBOOK_APP_ID ?? '');
  url.searchParams.set('redirect_uri', ctx.redirectUri);
  url.searchParams.set('state', ctx.state);
  url.searchParams.set('scope', scopes.join(','));
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

const FACEBOOK_SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_manage_metadata',
];

const INSTAGRAM_SCOPES = [
  ...FACEBOOK_SCOPES,
  'instagram_basic',
  'instagram_content_publish',
];

export const facebookAdapter: ChannelAdapter = {
  channel: 'facebook',
  label: 'Facebook',
  kind: 'oauth',
  scopes: FACEBOOK_SCOPES,
  isConfigured,
  buildAuthUrl(ctx) { return authUrl(FACEBOOK_SCOPES, ctx); },
  async exchangeCode(ctx): Promise<ExchangeCodeResult> {
    const short = await exchangeUserCode(ctx);
    const long = await exchangeForLongLived(short.access_token);
    const pages = await listPages(long.access_token);
    const page = pages[0];
    if (!page) {
      throw new Error('No Facebook Pages found on this account. Spider posts to pages, not personal feeds.');
    }
    const expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null;
    return {
      credentials: {
        user_access_token: long.access_token,
        page_access_token: page.access_token,
        expires_at: expiresAt?.toISOString() ?? null,
      },
      externalIds: { page_id: page.id, page_name: page.name },
      expiresAt,
    };
  },
};

export const instagramAdapter: ChannelAdapter = {
  channel: 'instagram' as Channel,
  label: 'Instagram',
  kind: 'oauth',
  scopes: INSTAGRAM_SCOPES,
  isConfigured,
  buildAuthUrl(ctx) { return authUrl(INSTAGRAM_SCOPES, ctx); },
  async exchangeCode(ctx): Promise<ExchangeCodeResult> {
    const short = await exchangeUserCode(ctx);
    const long = await exchangeForLongLived(short.access_token);
    const pages = await listPages(long.access_token);
    const page = pages[0];
    if (!page) {
      throw new Error('Connect at least one Facebook Page first — Instagram Business accounts are linked through a Page.');
    }
    const igId = await resolveInstagramAccount(page.id, page.access_token);
    if (!igId) {
      throw new Error(`Page "${page.name}" has no linked Instagram Business account. Link one in Meta Business Suite, then retry.`);
    }
    const expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null;
    return {
      credentials: {
        user_access_token: long.access_token,
        page_access_token: page.access_token,
        expires_at: expiresAt?.toISOString() ?? null,
      },
      externalIds: { instagram_account_id: igId, page_id: page.id, page_name: page.name },
      expiresAt,
    };
  },
};
