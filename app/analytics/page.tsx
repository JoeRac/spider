import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, CardHeader, Empty, StatTile, Badge, SectionLabel } from '@/components/ui';
import { BarChart3, TrendingUp, Eye, ThumbsUp } from 'lucide-react';
import { db } from '@/lib/db';
import { channelMetrics, contentMetrics, integrations, clients, contentTargets, contentItems } from '@/lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { listAdapters } from '@/lib/channels/registry';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const adapters = listAdapters();
  const labelByChannel = new Map(adapters.map((a) => [a.channel, a.label]));

  // Account-level followers, latest snapshot per integration.
  const liveChannels = await db
    .select({
      integrationId: integrations.id,
      channel: integrations.channel,
      clientId: integrations.clientId,
      clientName: clients.name,
      followers: channelMetrics.followers,
      posts: channelMetrics.posts,
      fetchedAt: channelMetrics.fetchedAt,
    })
    .from(integrations)
    .leftJoin(clients, eq(clients.id, integrations.clientId))
    .leftJoin(channelMetrics, eq(channelMetrics.integrationId, integrations.id))
    .where(eq(integrations.status, 'connected'))
    .orderBy(desc(channelMetrics.fetchedAt))
    .limit(200);

  // De-dupe to latest snapshot per integration.
  const seenIntegrations = new Set<string>();
  const channelRows = liveChannels.filter((r) => {
    if (seenIntegrations.has(r.integrationId)) return false;
    seenIntegrations.add(r.integrationId);
    return true;
  });

  // Per-target engagement totals from the latest snapshot per target.
  const [postCount] = await db.select({ n: sql<number>`count(*)::int` }).from(contentMetrics);
  const [totals] = await db.select({
    impressions: sql<number>`coalesce(sum(${contentMetrics.impressions}), 0)::int`,
    likes:       sql<number>`coalesce(sum(${contentMetrics.likes}), 0)::int`,
    comments:    sql<number>`coalesce(sum(${contentMetrics.comments}), 0)::int`,
    shares:      sql<number>`coalesce(sum(${contentMetrics.shares}), 0)::int`,
    views:       sql<number>`coalesce(sum(${contentMetrics.views}), 0)::int`,
  }).from(contentMetrics);

  // Top-performing posts (by impressions then likes).
  const topPosts = await db
    .select({
      itemId: contentItems.id,
      title: contentItems.title,
      body: contentItems.body,
      kind: contentItems.kind,
      clientId: clients.id,
      clientName: clients.name,
      channel: integrations.channel,
      externalUrl: contentTargets.externalUrl,
      impressions: contentMetrics.impressions,
      likes: contentMetrics.likes,
    })
    .from(contentMetrics)
    .innerJoin(contentTargets, eq(contentTargets.id, contentMetrics.contentTargetId))
    .innerJoin(contentItems, eq(contentItems.id, contentTargets.contentItemId))
    .innerJoin(integrations, eq(integrations.id, contentTargets.integrationId))
    .leftJoin(clients, eq(clients.id, contentItems.clientId))
    .orderBy(desc(contentMetrics.impressions), desc(contentMetrics.likes))
    .limit(10);

  return (
    <Shell>
      <PageHeader
        title="Analytics"
        subtitle="Engagement across every connected channel. Refreshed hourly by /api/cron/refresh-metrics."
        eyebrow="Growth"
      />
      <Page>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatTile label="Snapshots"   value={postCount?.n ?? 0}        hint="content_metrics rows" icon={<BarChart3 size={14} />} />
          <StatTile label="Impressions" value={(totals?.impressions ?? 0).toLocaleString()} tone="info" icon={<Eye size={14} />} />
          <StatTile label="Likes"       value={(totals?.likes ?? 0).toLocaleString()}       tone="ok"   icon={<ThumbsUp size={14} />} />
          <StatTile label="Engagements" value={((totals?.comments ?? 0) + (totals?.shares ?? 0)).toLocaleString()} tone="accent" icon={<TrendingUp size={14} />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader title="Channel followers" subtitle="Latest snapshot per connected integration." />
            {channelRows.length === 0 ? (
              <div className="p-5">
                <Empty
                  icon={<BarChart3 size={24} />}
                  title="No metrics yet"
                  hint="Once integrations are connected and the hourly cron runs, followers + posts land here."
                />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {channelRows.map((r) => (
                  <li key={r.integrationId} className="px-5 py-3 flex items-center gap-3 text-sm">
                    <span className="text-fg font-medium flex-1 truncate">{labelByChannel.get(r.channel) ?? r.channel}</span>
                    {r.clientId ? <Link href={`/clients/${r.clientId}`} className="text-xs text-muted hover:text-accent">{r.clientName}</Link> : null}
                    <span className="text-fg tabular-nums">{r.followers != null ? r.followers.toLocaleString() : '—'}</span>
                    <span className="text-xs text-faint">followers</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Top posts" subtitle="Highest-impression items across all clients." />
            {topPosts.length === 0 ? (
              <div className="p-5">
                <Empty
                  icon={<TrendingUp size={24} />}
                  title="No published content yet"
                  hint="As soon as autopilot publishes a post and the metrics cron has run, top performers land here."
                />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {topPosts.map((p, i) => (
                  <li key={p.itemId + i} className="px-5 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone="accent">{labelByChannel.get(p.channel) ?? p.channel}</Badge>
                      {p.clientId && <Link href={`/clients/${p.clientId}`} className="text-xs text-muted hover:text-accent">{p.clientName}</Link>}
                      <div className="ml-auto flex gap-3 text-xs tabular-nums">
                        <span className="text-muted">{(p.impressions ?? 0).toLocaleString()} impr</span>
                        <span className="text-ok">{(p.likes ?? 0).toLocaleString()} ♡</span>
                      </div>
                    </div>
                    <Link href={`/content/${p.itemId}`} className="text-sm text-fg hover:text-accent truncate block">
                      {p.title ?? p.body.slice(0, 80) + '…'}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="mt-6">
          <SectionLabel className="mb-2">How metrics flow</SectionLabel>
          <Card className="p-5 text-sm text-muted leading-relaxed">
            <p>Every hour <code className="font-mono text-xs bg-bg px-1.5 py-0.5 rounded border border-border">/api/cron/refresh-metrics</code> iterates connected integrations, calls each channel&apos;s fetcher with decrypted credentials, and appends <code className="font-mono text-xs bg-bg px-1.5 py-0.5 rounded border border-border">channel_metrics</code> + <code className="font-mono text-xs bg-bg px-1.5 py-0.5 rounded border border-border">content_metrics</code> snapshots. Snapshots are append-only so a future Phase 7 can chart growth + per-post lifetime curves without a separate analytics warehouse.</p>
          </Card>
        </div>
      </Page>
    </Shell>
  );
}
