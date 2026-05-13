/**
 * LinkedIn OAuth — the "Sign In with LinkedIn using OpenID Connect" +
 * `w_member_social` scope combo gives Spider what it needs to post on
 * behalf of the operator's personal profile. For posting to LinkedIn
 * *Pages* we'd add `w_organization_social` and resolve the org URN; for
 * phase 2 we ship personal posting and treat organisation posting as a
 * phase-4 follow-up.
 *
 * Env requirements:
 *   LINKEDIN_CLIENT_ID
 *   LINKEDIN_CLIENT_SECRET
 */
import type { ChannelAdapter, AuthUrlContext, ExchangeCodeContext, ExchangeCodeResult } from './types';

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const SCOPES = ['openid', 'profile', 'email', 'w_member_social'];

export const linkedinAdapter: ChannelAdapter = {
  channel: 'linkedin',
  label: 'LinkedIn',
  kind: 'oauth',
  scopes: SCOPES,

  isConfigured() {
    return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
  },

  buildAuthUrl(ctx: AuthUrlContext): string {
    const url = new URL(AUTH_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', process.env.LINKEDIN_CLIENT_ID ?? '');
    url.searchParams.set('redirect_uri', ctx.redirectUri);
    url.searchParams.set('scope', SCOPES.join(' '));
    url.searchParams.set('state', ctx.state);
    return url.toString();
  },

  async exchangeCode(ctx: ExchangeCodeContext): Promise<ExchangeCodeResult> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: ctx.code,
      client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
      redirect_uri: ctx.redirectUri,
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`LinkedIn token ${res.status}: ${await res.text()}`);
    const tokens = await res.json() as { access_token: string; expires_in: number; scope: string; id_token?: string };

    let memberId = '';
    let memberName = '';
    try {
      const me = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      if (me.ok) {
        const info = await me.json() as { sub?: string; name?: string };
        memberId = info.sub ?? '';
        memberName = info.name ?? '';
      }
    } catch { /* ignore */ }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    return {
      credentials: {
        access_token: tokens.access_token,
        scope: tokens.scope,
        expires_at: expiresAt.toISOString(),
      },
      externalIds: {
        member_urn: memberId ? `urn:li:person:${memberId}` : '',
        member_name: memberName,
      },
      expiresAt,
    };
  },
};
