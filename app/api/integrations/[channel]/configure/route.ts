/**
 * POST /api/integrations/[channel]/configure
 *
 * Manual config endpoint for non-OAuth channels (currently only
 * `website_blog`). OAuth channels reject this and point at `/connect`.
 *
 * website_blog body shape:
 *   {
 *     clientId: string,
 *     mode: 'wordpress' | 'webhook',
 *     wordpress?: { baseUrl: string, username: string, applicationPassword: string },
 *     webhook?:   { url: string, secret?: string }
 *   }
 */
import { type NextRequest } from 'next/server';
import { ok, err, readJson } from '@/lib/api-helpers';
import { upsertConnectedIntegration } from '@/lib/integration-store';
import { getAdapter } from '@/lib/channels/registry';
import { CHANNELS, type Channel } from '@/lib/db/schema';
import { isSafeHttpUrl } from '@/lib/security/safe-url';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type WebsiteBlogBody = {
  clientId: string;
  mode: 'wordpress' | 'webhook';
  wordpress?: { baseUrl: string; username: string; applicationPassword: string };
  webhook?: { url: string; secret?: string };
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  const { channel: channelRaw } = await params;
  if (!CHANNELS.includes(channelRaw as Channel)) return err(404, `Unknown channel: ${channelRaw}`);
  const channel = channelRaw as Channel;

  const adapter = getAdapter(channel);
  if (adapter.kind !== 'manual') {
    return err(400, `${adapter.label} uses OAuth — start at /api/integrations/${channel}/connect.`);
  }

  if (channel === 'website_blog') {
    const body = await readJson<WebsiteBlogBody>(req);
    if (body instanceof Response) return body;
    if (!body?.clientId) return err(400, 'clientId required');
    if (body.mode !== 'wordpress' && body.mode !== 'webhook') return err(400, 'mode must be wordpress or webhook');

    let credentials: Record<string, unknown>;
    let externalIds: Record<string, string>;

    if (body.mode === 'wordpress') {
      const wp = body.wordpress;
      if (!wp?.baseUrl || !wp.username || !wp.applicationPassword) {
        return err(400, 'wordpress requires baseUrl, username, applicationPassword');
      }
      // SSRF guard: reject private / loopback / link-local / metadata targets at save time.
      if (!isSafeHttpUrl(wp.baseUrl)) {
        return err(400, 'wordpress baseUrl must be a public http/https URL');
      }
      credentials = { mode: 'wordpress', ...wp };
      externalIds = { base_url: wp.baseUrl };
    } else {
      const wh = body.webhook;
      if (!wh?.url) return err(400, 'webhook requires url');
      // SSRF guard: reject private / loopback / link-local / metadata targets at save time.
      if (!isSafeHttpUrl(wh.url)) {
        return err(400, 'webhook url must be a public http/https URL');
      }
      credentials = { mode: 'webhook', ...wh };
      externalIds = { webhook_url: wh.url };
    }

    await upsertConnectedIntegration({
      clientId: body.clientId,
      channel,
      credentials,
      externalIds,
      expiresAt: null,
    });
    return ok({ mode: body.mode });
  }

  return err(400, `No configure handler for channel: ${channel}`);
}
