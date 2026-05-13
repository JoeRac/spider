/**
 * YouTube metrics — uses YouTube Data API v3 channel + videos endpoints.
 */
import type { MetricsFetcher } from './types';

export const youtubeMetrics: MetricsFetcher = {
  channel: 'youtube',
  async fetchMetrics(ctx) {
    const token = ctx.credentials.access_token as string | undefined;
    const channelId = ctx.externalIds.channel_id;
    if (!token || !channelId) return {};

    let channel = null;
    try {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (r.ok) {
        const body = await r.json() as { items?: Array<{ statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string } }> };
        const s = body.items?.[0]?.statistics;
        if (s) channel = {
          followers: s.subscriberCount ? Number(s.subscriberCount) : null,
          posts: s.videoCount ? Number(s.videoCount) : null,
          extra: { views: s.viewCount ? Number(s.viewCount) : 0 },
        };
      }
    } catch { /* ignore */ }

    const content: Array<NonNullable<Awaited<ReturnType<MetricsFetcher['fetchMetrics']>>['content']>[number]> = [];
    if (ctx.postIds.length) {
      const ids = ctx.postIds.slice(0, 50).join(',');
      try {
        const r = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids}`,
          { headers: { authorization: `Bearer ${token}` } },
        );
        if (r.ok) {
          const body = await r.json() as { items?: Array<{ id?: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string; favoriteCount?: string } }> };
          for (const v of body.items ?? []) {
            if (!v.id) continue;
            content.push({
              externalId: v.id,
              views: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
              likes: v.statistics?.likeCount ? Number(v.statistics.likeCount) : null,
              comments: v.statistics?.commentCount ? Number(v.statistics.commentCount) : null,
            });
          }
        }
      } catch { /* ignore */ }
    }

    return { channel, content };
  },
};
