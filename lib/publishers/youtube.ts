/**
 * YouTube publisher — phase 4 ships the description-only path: we update
 * the description of the latest video on the connected channel using
 * the generated content. Full video uploads come in phase 5 once we
 * have the media pipeline. This still gives the client value: regular
 * description refreshes are an SEO win.
 *
 * If the channel has no videos yet, the publisher records a clear error
 * and skips so the cron worker doesn't keep retrying.
 */
import type { ChannelPublisher, PublishContext, PublishResult } from './types';

export const youtubePublisher: ChannelPublisher = {
  channel: 'youtube',
  async publish(ctx: PublishContext): Promise<PublishResult> {
    const access = (ctx.credentials.access_token as string | undefined) ?? '';
    const channelId = ctx.externalIds.channel_id;
    if (!access) throw new Error('YouTube integration has no access_token');
    if (!channelId) throw new Error('YouTube channel_id not resolved — reconnect.');

    // Find the latest video on this channel.
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&order=date&maxResults=1&type=video`,
      { headers: { authorization: `Bearer ${access}` } },
    );
    if (!searchRes.ok) throw new Error(`YouTube search ${searchRes.status}: ${await searchRes.text()}`);
    const search = await searchRes.json() as { items?: Array<{ id?: { videoId?: string } }> };
    const videoId = search.items?.[0]?.id?.videoId;
    if (!videoId) throw new Error('YouTube channel has no videos — nothing to update yet.');

    // Read the existing snippet (so we don't clobber title/categoryId).
    const getRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
      { headers: { authorization: `Bearer ${access}` } },
    );
    if (!getRes.ok) throw new Error(`YouTube get ${getRes.status}: ${await getRes.text()}`);
    const got = await getRes.json() as { items?: Array<{ snippet?: { title?: string; categoryId?: string } }> };
    const snippet = got.items?.[0]?.snippet;
    if (!snippet) throw new Error('YouTube returned no snippet for the latest video.');

    const updateRes = await fetch(
      'https://www.googleapis.com/youtube/v3/videos?part=snippet',
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${access}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: videoId,
          snippet: {
            title: snippet.title ?? ctx.item.title ?? 'Update',
            description: ctx.item.body,
            categoryId: snippet.categoryId ?? '22',
          },
        }),
      },
    );
    if (!updateRes.ok) throw new Error(`YouTube update ${updateRes.status}: ${await updateRes.text()}`);
    return {
      externalId: videoId,
      externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  },
};
