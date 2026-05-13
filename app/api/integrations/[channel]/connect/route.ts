/**
 * GET /api/integrations/[channel]/connect?clientId=...
 *
 * Starts the OAuth flow for `channel` on behalf of `clientId`. Resolves
 * the adapter from the registry, builds the auth URL, and 302s to the
 * provider. The signed state token round-trips clientId + channel so the
 * callback knows where to write the result.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getAdapter } from '@/lib/channels/registry';
import { encodeState } from '@/lib/oauth-state';
import { config } from '@/lib/config';
import { CHANNELS, type Channel } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function redirectUriFor(channel: Channel, req: NextRequest): string {
  // Prefer the env-configured public URL; fall back to the request origin
  // so local dev "just works" without configuration.
  const origin = config.publicUrl?.replace(/\/$/, '') || new URL(req.url).origin;
  return `${origin}/api/integrations/${channel}/callback`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  const { channel: channelRaw } = await params;
  if (!CHANNELS.includes(channelRaw as Channel)) {
    return NextResponse.json({ error: `Unknown channel: ${channelRaw}` }, { status: 404 });
  }
  const channel = channelRaw as Channel;

  const url = req.nextUrl;
  const clientId = url.searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 });

  const adapter = getAdapter(channel);
  if (adapter.kind !== 'oauth') {
    return NextResponse.json({ error: `${adapter.label} uses manual configuration; POST to /api/integrations/${channel}/configure instead.` }, { status: 400 });
  }
  if (!adapter.isConfigured()) {
    return NextResponse.json({ error: `${adapter.label} OAuth app is not configured on this server. See Settings.` }, { status: 503 });
  }

  const state = encodeState({ clientId, channel });
  const redirectUri = redirectUriFor(channel, req);
  const authUrl = adapter.buildAuthUrl({ state, redirectUri });
  return NextResponse.redirect(authUrl);
}
