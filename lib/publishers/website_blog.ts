/**
 * Website blog publisher — supports two modes (chosen at configure time):
 *
 *   1. WordPress REST: POST /wp-json/wp/v2/posts with Basic auth
 *      (username + application password).
 *   2. Generic webhook: POST a JSON envelope to the operator's webhook
 *      URL. Optionally HMAC-signed with the stored secret.
 */
import type { ChannelPublisher, PublishContext, PublishResult } from './types';
import { createHmac } from 'node:crypto';
import { assertSafeHttpUrl } from '@/lib/security/safe-url';

export const websiteBlogPublisher: ChannelPublisher = {
  channel: 'website_blog',
  async publish(ctx: PublishContext): Promise<PublishResult> {
    const mode = ctx.credentials.mode as 'wordpress' | 'webhook' | undefined;
    if (mode === 'wordpress') return publishWordPress(ctx);
    if (mode === 'webhook') return publishWebhook(ctx);
    throw new Error('website_blog mode not configured — set it on the client detail page.');
  },
};

async function publishWordPress(ctx: PublishContext): Promise<PublishResult> {
  const baseUrl = (ctx.credentials.baseUrl as string | undefined)?.replace(/\/$/, '');
  const username = ctx.credentials.username as string | undefined;
  const password = ctx.credentials.applicationPassword as string | undefined;
  if (!baseUrl || !username || !password) throw new Error('WordPress mode missing baseUrl / username / applicationPassword');

  // SSRF guard: reject private / loopback / link-local / metadata targets.
  assertSafeHttpUrl(baseUrl);

  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      title: ctx.item.title ?? '(untitled)',
      content: ctx.item.body,
      status: 'publish',
    }),
  });
  if (!res.ok) throw new Error(`WordPress publish ${res.status}: ${await res.text()}`);
  const body = await res.json() as { id?: number; link?: string };
  return {
    externalId: body.id ? String(body.id) : '',
    externalUrl: body.link ?? null,
  };
}

async function publishWebhook(ctx: PublishContext): Promise<PublishResult> {
  const url = ctx.credentials.url as string | undefined;
  const secret = ctx.credentials.secret as string | undefined;
  if (!url) throw new Error('Webhook mode missing url');

  // SSRF guard: reject private / loopback / link-local / metadata targets.
  assertSafeHttpUrl(url);

  const payload = JSON.stringify({
    id: ctx.item.id,
    kind: ctx.item.kind,
    title: ctx.item.title,
    body: ctx.item.body,
    mediaUrls: ctx.item.mediaUrls,
    metadata: ctx.item.metadata,
    ts: Date.now(),
  });

  const headers: Record<string, string> = { 'content-type': 'application/json', 'user-agent': 'Spider/1.0' };
  if (secret) {
    headers['x-spider-signature'] = createHmac('sha256', secret).update(payload).digest('hex');
  }
  const res = await fetch(url, { method: 'POST', headers, body: payload });
  if (!res.ok) throw new Error(`Webhook ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { externalId: `webhook:${ctx.item.id}`, externalUrl: null };
}
