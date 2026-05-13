/**
 * Metrics refresh loop — pulls one snapshot per connected integration
 * and one snapshot per published content_target. Snapshots are
 * append-only; the dashboard renders the latest + plots history.
 */
import { db } from '@/lib/db';
import { integrations, contentTargets, channelMetrics, contentMetrics } from '@/lib/db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';
import { decryptJSON } from '@/lib/crypto';
import { getMetricsFetcher, metricsChannels } from './registry';
import type { Channel } from '@/lib/db/schema';

type Summary = { integrations: number; channelSnapshots: number; contentSnapshots: number; errors: string[] };

export async function refreshAllMetrics(): Promise<Summary> {
  const channels = metricsChannels();
  const live = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.status, 'connected')));
  const filtered = live.filter((i) => channels.includes(i.channel as Channel));

  const summary: Summary = { integrations: filtered.length, channelSnapshots: 0, contentSnapshots: 0, errors: [] };

  for (const integration of filtered) {
    const fetcher = getMetricsFetcher(integration.channel as Channel);
    if (!fetcher) continue;

    // Collect the published target ids for this integration so we can
    // fetch per-post metrics in one call.
    const targets = await db.select({
      id: contentTargets.id,
      externalId: contentTargets.externalId,
    })
      .from(contentTargets)
      .where(and(
        eq(contentTargets.integrationId, integration.id),
        eq(contentTargets.status, 'published'),
        isNotNull(contentTargets.externalId),
      ))
      .limit(100);

    const idMap = new Map(targets.filter((t) => t.externalId).map((t) => [t.externalId as string, t.id]));
    const postIds = Array.from(idMap.keys());

    try {
      const credentials = decryptStored(integration.credentials as unknown);
      const result = await fetcher.fetchMetrics({
        channel: integration.channel as Channel,
        credentials,
        externalIds: integration.externalIds as Record<string, string>,
        postIds,
      });

      if (result.channel) {
        await db.insert(channelMetrics).values({
          integrationId: integration.id,
          followers: result.channel.followers ?? null,
          posts: result.channel.posts ?? null,
          extra: result.channel.extra ?? {},
        });
        summary.channelSnapshots += 1;
      }
      for (const c of result.content ?? []) {
        const targetId = idMap.get(c.externalId);
        if (!targetId) continue;
        await db.insert(contentMetrics).values({
          contentTargetId: targetId,
          impressions: c.impressions ?? null,
          likes: c.likes ?? null,
          comments: c.comments ?? null,
          shares: c.shares ?? null,
          clicks: c.clicks ?? null,
          views: c.views ?? null,
          extra: c.extra ?? {},
        });
        summary.contentSnapshots += 1;
      }
    } catch (e) {
      summary.errors.push(`${integration.channel}: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  return summary;
}

function decryptStored(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const obj = value as Record<string, unknown>;
  const ct = obj.__ciphertext;
  if (typeof ct === 'string') {
    try { return decryptJSON<Record<string, unknown>>(ct); }
    catch { return {}; }
  }
  return obj;
}
