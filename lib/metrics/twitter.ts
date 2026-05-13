/**
 * Twitter / X metrics — uses the v2 API.
 *
 * Account level: GET /2/users/:id with user.fields=public_metrics
 * Per-tweet:     GET /2/tweets?ids=...&tweet.fields=public_metrics
 *
 * X charges per-read on metered tiers; the cron is configured to run
 * hourly to keep cost bounded.
 */
import type { MetricsFetcher } from './types';

export const twitterMetrics: MetricsFetcher = {
  channel: 'twitter',
  async fetchMetrics(ctx) {
    const token = ctx.credentials.access_token as string | undefined;
    if (!token) throw new Error('Twitter metrics: missing access_token');
    const userId = ctx.externalIds.user_id;

    // Account-level
    let channel = null;
    if (userId) {
      const r = await fetch(`https://api.twitter.com/2/users/${userId}?user.fields=public_metrics`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const body = await r.json() as { data?: { public_metrics?: { followers_count?: number; tweet_count?: number; following_count?: number } } };
        const pm = body.data?.public_metrics;
        if (pm) channel = { followers: pm.followers_count ?? null, posts: pm.tweet_count ?? null, extra: { following: pm.following_count ?? 0 } };
      }
    }

    // Per-post
    const content: Array<NonNullable<Awaited<ReturnType<MetricsFetcher['fetchMetrics']>>['content']>[number]> = [];
    if (ctx.postIds.length) {
      // /2/tweets accepts up to 100 ids per call.
      for (let i = 0; i < ctx.postIds.length; i += 100) {
        const ids = ctx.postIds.slice(i, i + 100).join(',');
        const r = await fetch(`https://api.twitter.com/2/tweets?ids=${ids}&tweet.fields=public_metrics`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!r.ok) continue;
        const body = await r.json() as { data?: Array<{ id?: string; public_metrics?: { like_count?: number; reply_count?: number; retweet_count?: number; quote_count?: number; impression_count?: number } }> };
        for (const t of body.data ?? []) {
          if (!t.id) continue;
          content.push({
            externalId: t.id,
            impressions: t.public_metrics?.impression_count ?? null,
            likes: t.public_metrics?.like_count ?? null,
            comments: t.public_metrics?.reply_count ?? null,
            shares: (t.public_metrics?.retweet_count ?? 0) + (t.public_metrics?.quote_count ?? 0),
          });
        }
      }
    }

    return { channel, content };
  },
};
