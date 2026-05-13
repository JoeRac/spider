import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, Empty, Badge } from '@/components/ui';
import { CalendarClock } from 'lucide-react';
import { db } from '@/lib/db';
import { contentItems, contentTargets, integrations, clients } from '@/lib/db/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { listAdapters } from '@/lib/channels/registry';

export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  // Pull pending+publishing targets joined with their items.
  const targets = await db
    .select({
      target: contentTargets,
      item: contentItems,
      integration: integrations,
      clientName: clients.name,
      clientId: clients.id,
    })
    .from(contentTargets)
    .innerJoin(contentItems, eq(contentItems.id, contentTargets.contentItemId))
    .innerJoin(integrations, eq(integrations.id, contentTargets.integrationId))
    .leftJoin(clients, eq(clients.id, contentItems.clientId))
    .where(inArray(contentTargets.status, ['pending', 'publishing']))
    .orderBy(asc(contentItems.scheduledFor))
    .limit(200);

  const adapters = listAdapters();
  const labelByChannel = new Map(adapters.map((a) => [a.channel, a.label]));

  return (
    <Shell>
      <PageHeader
        title="Schedule"
        subtitle="Upcoming publish events across every client + channel. Powered by the /api/cron/publish worker."
        eyebrow="Schedule"
      />
      <Page>
        {targets.length === 0 ? (
          <Empty
            icon={<CalendarClock size={28} />}
            title="Nothing pending"
            hint="Schedule content from the content detail page; it shows up here until the cron picks it up."
          />
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead className="bg-subtle/60 text-xs uppercase tracking-wider text-faint">
                <tr>
                  <th className="text-left font-semibold px-5 py-2.5">When</th>
                  <th className="text-left font-semibold px-5 py-2.5">Channel</th>
                  <th className="text-left font-semibold px-5 py-2.5">Client</th>
                  <th className="text-left font-semibold px-5 py-2.5">Item</th>
                  <th className="text-left font-semibold px-5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {targets.map((t) => (
                  <tr key={t.target.id} className="hover:bg-subtle/40 transition-colors">
                    <td className="px-5 py-3 text-muted tabular-nums">
                      {t.item.scheduledFor
                        ? new Date(t.item.scheduledFor).toLocaleString()
                        : <span className="text-faint">ASAP</span>}
                    </td>
                    <td className="px-5 py-3 text-fg">{labelByChannel.get(t.integration.channel) ?? t.integration.channel}</td>
                    <td className="px-5 py-3">
                      {t.clientId
                        ? <Link href={`/clients/${t.clientId}`} className="text-muted hover:text-accent">{t.clientName}</Link>
                        : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-5 py-3 max-w-md truncate">
                      <Link href={`/content/${t.item.id}`} className="text-fg hover:text-accent">{t.item.title ?? t.item.body.slice(0, 80)}</Link>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={t.target.status === 'publishing' ? 'info' : 'neutral'}>{t.target.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Page>
    </Shell>
  );
}
