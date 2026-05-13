/**
 * LinkedIn metrics — uses the Member Profile API + UGC posts API.
 *
 * LinkedIn's analytics endpoints require additional partner permissions
 * (Marketing Developer Platform) that the default w_member_social scope
 * doesn't grant. For phase 6 we report whatever the user's profile
 * surface gives us; richer per-post analytics ship when we're approved
 * for the analytics API.
 */
import type { MetricsFetcher } from './types';

export const linkedinMetrics: MetricsFetcher = {
  channel: 'linkedin',
  async fetchMetrics(ctx) {
    const token = ctx.credentials.access_token as string | undefined;
    if (!token) return {};
    // OIDC userinfo doesn't include follower count — return a stub so the
    // dashboard renders a row with a "metrics requires Marketing API"
    // note. Real implementation lands when the OAuth app is approved.
    return {
      channel: { followers: null, posts: null, extra: { note: 'LinkedIn metrics require Marketing Developer Platform approval.' } },
      content: ctx.postIds.map((id) => ({ externalId: id })),
    };
  },
};
