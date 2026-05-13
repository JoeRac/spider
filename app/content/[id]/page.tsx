import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, CardHeader, Badge, MetaList, SectionLabel } from '@/components/ui';
import { db } from '@/lib/db';
import { contentItems, clients, generationRuns } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ContentEditor } from './editor';

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
          <div className="lg:col-span-2">
            <ContentEditor item={{
              id: item.id,
              title: item.title,
              body: item.body,
              status: item.status,
              scheduledFor: item.scheduledFor ? new Date(item.scheduledFor).toISOString() : null,
            }} />
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Details" />
              <div className="px-5 py-4">
                <MetaList items={[
                  { label: 'Kind',       value: item.kind },
                  { label: 'Status',     value: item.status },
                  { label: 'Client',     value: row.clientId
                    ? <Link href={`/clients/${row.clientId}`} className="hover:text-accent">{row.clientName ?? '—'}</Link>
                    : '—' },
                  { label: 'Created',    value: new Date(item.createdAt).toLocaleString() },
                  { label: 'Updated',    value: new Date(item.updatedAt).toLocaleString() },
                  { label: 'Scheduled',  value: item.scheduledFor ? new Date(item.scheduledFor).toLocaleString() : '—' },
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

            {item.metadata && Object.keys(item.metadata as object).length > 0 && (
              <Card className="p-5">
                <SectionLabel className="mb-2">Metadata</SectionLabel>
                <pre className="text-[11px] text-muted bg-bg/40 rounded p-3 overflow-x-auto leading-snug">
                  {JSON.stringify(item.metadata, null, 2)}
                </pre>
              </Card>
            )}
          </div>
        </div>
      </Page>
    </Shell>
  );
}
