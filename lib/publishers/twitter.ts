/**
 * Twitter / X publisher — POSTs a single tweet via the v2 API.
 *
 * Body length is capped at 280 characters. We truncate rather than fail
 * because content_items.body can be longer if it was authored for a
 * different channel and dual-routed; the operator can pre-trim in the
 * editor for full control.
 */
import type { ChannelPublisher, PublishContext, PublishResult } from './types';

export const twitterPublisher: ChannelPublisher = {
  channel: 'twitter',
  async publish(ctx: PublishContext): Promise<PublishResult> {
    const access = (ctx.credentials.access_token as string | undefined) ?? '';
    if (!access) throw new Error('Twitter integration has no access_token');

    const text = clamp(ctx.item.body, 280);
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Twitter publish ${res.status}: ${await res.text()}`);
    const body = await res.json() as { data?: { id?: string } };
    const id = body.data?.id ?? '';
    const username = ctx.externalIds.username;
    return {
      externalId: id,
      externalUrl: id && username ? `https://twitter.com/${username}/status/${id}` : null,
    };
  },
};

function clamp(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
