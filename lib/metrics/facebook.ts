/**
 * Facebook + Instagram metrics — both via Meta Graph API v21.0.
 *
 * Facebook page level: GET /{page-id}?fields=fan_count,followers_count
 * Facebook per-post:   GET /{post-id}/insights?metric=post_impressions,post_reactions_by_type_total,post_clicks
 * Instagram per-media: GET /{media-id}/insights?metric=impressions,reach,likes,comments,saved,shares
 *
 * Metrics calls are batched where the SDK allows; here we do plain
 * sequential to keep dependencies minimal.
 */
import type { MetricsFetcher } from './types';

const GRAPH = 'https://graph.facebook.com/v21.0';

export const facebookMetrics: MetricsFetcher = {
  channel: 'facebook',
  async fetchMetrics(ctx) {
    const pageToken = ctx.credentials.page_access_token as string | undefined;
    const pageId = ctx.externalIds.page_id;
    if (!pageToken || !pageId) return {};

    let channel = null;
    try {
      const r = await fetch(`${GRAPH}/${pageId}?fields=fan_count,followers_count,name&access_token=${pageToken}`);
      if (r.ok) {
        const body = await r.json() as { fan_count?: number; followers_count?: number; name?: string };
        channel = { followers: body.followers_count ?? body.fan_count ?? null, posts: null, extra: { name: body.name ?? '' } };
      }
    } catch { /* ignore */ }

    const content: Array<NonNullable<Awaited<ReturnType<MetricsFetcher['fetchMetrics']>>['content']>[number]> = [];
    for (const id of ctx.postIds.slice(0, 50)) {
      try {
        const r = await fetch(`${GRAPH}/${id}/insights?metric=post_impressions,post_clicks,post_reactions_by_type_total&access_token=${pageToken}`);
        if (!r.ok) continue;
        const body = await r.json() as { data?: Array<{ name?: string; values?: Array<{ value?: unknown }> }> };
        let impressions = 0, clicks = 0, likes = 0;
        for (const m of body.data ?? []) {
          const v = m.values?.[0]?.value as number | Record<string, number> | undefined;
          if (m.name === 'post_impressions' && typeof v === 'number') impressions = v;
          if (m.name === 'post_clicks' && typeof v === 'number') clicks = v;
          if (m.name === 'post_reactions_by_type_total' && v && typeof v === 'object') {
            likes = Object.values(v as Record<string, number>).reduce((a, b) => a + (b || 0), 0);
          }
        }
        content.push({ externalId: id, impressions, clicks, likes });
      } catch { /* ignore */ }
    }
    return { channel, content };
  },
};

export const instagramMetrics: MetricsFetcher = {
  channel: 'instagram',
  async fetchMetrics(ctx) {
    const pageToken = ctx.credentials.page_access_token as string | undefined;
    const igId = ctx.externalIds.instagram_account_id;
    if (!pageToken || !igId) return {};

    let channel = null;
    try {
      const r = await fetch(`${GRAPH}/${igId}?fields=followers_count,media_count,username&access_token=${pageToken}`);
      if (r.ok) {
        const body = await r.json() as { followers_count?: number; media_count?: number; username?: string };
        channel = { followers: body.followers_count ?? null, posts: body.media_count ?? null, extra: { username: body.username ?? '' } };
      }
    } catch { /* ignore */ }

    const content: Array<NonNullable<Awaited<ReturnType<MetricsFetcher['fetchMetrics']>>['content']>[number]> = [];
    for (const id of ctx.postIds.slice(0, 50)) {
      try {
        const r = await fetch(`${GRAPH}/${id}/insights?metric=impressions,reach,likes,comments,saved,shares&access_token=${pageToken}`);
        if (!r.ok) continue;
        const body = await r.json() as { data?: Array<{ name?: string; values?: Array<{ value?: number }> }> };
        const grab = (name: string) => body.data?.find((d) => d.name === name)?.values?.[0]?.value ?? null;
        content.push({
          externalId: id,
          impressions: (grab('impressions') as number | null),
          likes: (grab('likes') as number | null),
          comments: (grab('comments') as number | null),
          shares: (grab('shares') as number | null),
          extra: { reach: (grab('reach') as number | null) ?? 0, saved: (grab('saved') as number | null) ?? 0 },
        });
      } catch { /* ignore */ }
    }
    return { channel, content };
  },
};
