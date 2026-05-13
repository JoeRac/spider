import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, CardHeader, Badge, MetaList, SectionLabel } from '@/components/ui';
import { db } from '@/lib/db';
import { contentItems, clients, generationRuns, integrations, contentTargets, type Channel } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Composer, type ComposerItem } from './composer';
import { ScheduleCard } from './schedule-card';
import { MediaPanel } from './media-panel';
import { listAdapters } from '@/lib/channels/registry';

export const dynamic = 'force-dynamic';

export default async function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db
    .select({
      item: contentItems,
      clientName: clients.name,
      clientId: clients.id,
      runId: generationRuns.id,
      runStatus: generationRuns.status,
      runCost: generationRuns.costCents,
      runModel: generationRuns.model,
    })
    .from(contentItems)
    .leftJoin(clients, eq(clients.id, contentItems.clientId))
    .leftJoin(generationRuns, eq(generationRuns.id, contentItems.generationRunId))
    .where(eq(contentItems.id, id))
    .limit(1);
  if (!row) notFound();
  const { item } = row;

  const adapters = listAdapters();
  const labelByChannel = new Map(adapters.map((a) => [a.channel, a.label]));

  const clientIntegrations = await db
    .select({
      id: integrations.id, channel: integrations.channel, status: integrations.status,
    })
    .from(integrations)
    .where(eq(integrations.clientId, item.clientId));

  const targets = await db
    .select({
      id: contentTargets.id,
      integrationId: contentTargets.integrationId,
      status: contentTargets.status,
      externalUrl: contentTargets.externalUrl,
      publishedAt: contentTargets.publishedAt,
      lastError: contentTargets.lastError,
      channel: integrations.channel,
    })
    .from(contentTargets)
    .innerJoin(integrations, eq(integrations.id, contentTargets.integrationId))
    .where(eq(contentTargets.contentItemId, id));

  const meta = (item.metadata as Record<string, unknown>) ?? {};
  const variants = ((meta.variants as Record<string, string> | undefined) ?? {});

  const composerItem: ComposerItem = {
    id: item.id,
    title: item.title,
    body: item.body,
    kind: item.kind,
    status: item.status as ComposerItem['status'],
    scheduledFor: item.scheduledFor ? new Date(item.scheduledFor).toISOString() : null,
    variants,
  };

  const channelsForComposer = clientIntegrations.map((i) => ({
    channel: i.channel,
    label: labelByChannel.get(i.channel as Channel) ?? i.channel,
    status: i.status,
  }));

  return (
    <Shell>
      <PageHeader
        breadcrumbs={[
          { label: 'Content', href: '/content' },
          { label: row.clientName ?? 'Client', href: row.clientId ? `/clients/${row.clientId}` : undefined },
          { label: item.kind },
        ]}
        title={item.title ?? '(untitled)'}
        subtitle={`${item.kind} for ${row.clientName ?? 'client'}`}
        actions={<Badge tone={item.status === 'published' ? 'ok' : item.status === 'failed' ? 'err' : 'info'}>{item.status}</Badge>}
      />
      <Page max="5xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Composer item={composerItem} channels={channelsForComposer} />

            <MediaPanel itemId={item.id} clientId={item.clientId} urls={(item.mediaUrls as string[]) ?? []} />

            <ScheduleCard
              itemId={item.id}
              scheduledFor={item.scheduledFor ? new Date(item.scheduledFor).toISOString() : null}
              availableIntegrations={clientIntegrations.map((i) => ({
                id: i.id, channel: i.channel as Channel, status: i.status,
                channelLabel: labelByChannel.get(i.channel as Channel) ?? i.channel,
              }))}
              targets={targets.map((t) => ({
                id: t.id, integrationId: t.integrationId, status: t.status,
                externalUrl: t.externalUrl, publishedAt: t.publishedAt?.toISOString() ?? null,
                lastError: t.lastError, channelLabel: labelByChannel.get(t.channel as Channel) ?? t.channel,
              }))}
            />
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Details" />
              <div className="px-5 py-4">
                <MetaList items={[
                  { label: 'Kind',       value: item.kind },
                  { label: 'Client',     value: row.clientId
                    ? <Link href={`/clients/${row.clientId}`} className="hover:text-accent">{row.clientName ?? '—'}</Link>
                    : '—' },
                  { label: 'Variants',   value: Object.keys(variants).length === 0
                    ? <span className="text-faint">none — all channels use canonical</span>
                    : `${Object.keys(variants).length} channel${Object.keys(variants).length === 1 ? '' : 's'}` },
                  { label: 'Created',    value: new Date(item.createdAt).toLocaleString() },
                  { label: 'Updated',    value: new Date(item.updatedAt).toLocaleString() },
                ]} />
              </div>
            </Card>

            {row.runId && (
              <Card>
                <CardHeader title="Generation" subtitle="The Z.AI run that produced this draft." />
                <div className="px-5 py-4">
                  <MetaList items={[
                    { label: 'Model',    value: row.runModel ?? '—' },
                    { label: 'Run',      value: row.runStatus ?? '—' },
                    { label: 'Cost',     value: row.runCost != null ? `${(row.runCost / 100).toFixed(2)} ¢` : '—' },
                  ]} />
                </div>
              </Card>
            )}

            {meta && Object.keys(meta).filter((k) => k !== 'variants').length > 0 && (
              <Card className="p-5">
                <SectionLabel className="mb-2">Metadata</SectionLabel>
                <pre className="text-[11px] text-muted bg-bg/40 rounded p-3 overflow-x-auto leading-snug">
                  {JSON.stringify(Object.fromEntries(Object.entries(meta).filter(([k]) => k !== 'variants')), null, 2)}
                </pre>
              </Card>
            )}
          </div>
        </div>
      </Page>
    </Shell>
  );
}
