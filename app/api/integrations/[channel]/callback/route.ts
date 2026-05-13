/**
 * GET /api/integrations/[channel]/callback?code=...&state=...
 *
 * OAuth callback handler — symmetric to the `connect` route. Decodes the
 * signed state, dispatches into the adapter to exchange the code, writes
 * an `integrations` row with encrypted credentials, then redirects back
 * to the client page so the operator sees the green "connected" chip.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getAdapter } from '@/lib/channels/registry';
import { decodeState } from '@/lib/oauth-state';
import { upsertConnectedIntegration } from '@/lib/integration-store';
import { config } from '@/lib/config';
import { CHANNELS, type Channel } from '@/lib/db/schema';
import { pickTwitterVerifierFromState, withTwitterVerifier } from '@/lib/channels/twitter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function redirectUriFor(channel: Channel, req: NextRequest): string {
  const origin = config.publicUrl?.replace(/\/$/, '') || new URL(req.url).origin;
  return `${origin}/api/integrations/${channel}/callback`;
}

function publicReturn(req: NextRequest, path: string): URL {
  const origin = config.publicUrl?.replace(/\/$/, '') || new URL(req.url).origin;
  return new URL(path, origin);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  const { channel: channelRaw } = await params;
  if (!CHANNELS.includes(channelRaw as Channel)) {
    return NextResponse.json({ error: `Unknown channel: ${channelRaw}` }, { status: 404 });
  }
  const channel = channelRaw as Channel;

  const url = req.nextUrl;
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');

  if (error) {
    const back = publicReturn(req, `/clients`);
    back.searchParams.set('integration_error', `${channel}: ${errorDescription ?? error}`);
    return NextResponse.redirect(back);
  }
  if (!code || !stateParam) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  // Twitter stashes the PKCE verifier in the state suffix.
  let stateToken = stateParam;
  let twitterVerifier = '';
  if (channel === 'twitter') {
    const { stateOnly, verifier } = pickTwitterVerifierFromState(stateParam);
    stateToken = stateOnly;
    twitterVerifier = verifier;
  }

  let decoded;
  try {
    decoded = decodeState(stateToken);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Bad state' }, { status: 400 });
  }
  if (decoded.channel !== channel) {
    return NextResponse.json({ error: 'state/channel mismatch' }, { status: 400 });
  }

  const adapter = getAdapter(channel);
  const redirectUri = redirectUriFor(channel, req);

  try {
    const result = channel === 'twitter'
      ? await withTwitterVerifier(twitterVerifier, () => adapter.exchangeCode({ code, redirectUri }))
      : await adapter.exchangeCode({ code, redirectUri });
    await upsertConnectedIntegration({
      clientId: decoded.clientId,
      channel,
      credentials: result.credentials,
      externalIds: result.externalIds,
      expiresAt: result.expiresAt ?? null,
    });
    const back = publicReturn(req, `/clients/${decoded.clientId}`);
    back.searchParams.set('integration_connected', channel);
    return NextResponse.redirect(back);
  } catch (e) {
    const back = publicReturn(req, `/clients/${decoded.clientId}`);
    back.searchParams.set('integration_error', `${channel}: ${e instanceof Error ? e.message : 'unknown'}`);
    return NextResponse.redirect(back);
  }
}
