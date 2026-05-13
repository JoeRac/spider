import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, Empty, Badge } from '@/components/ui';
import { Plug } from 'lucide-react';
import { db } from '@/lib/db';
import { clients, integrations, CHANNELS, type Channel } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const CHANNEL_LABELS: Record<Channel, string> = {
  google_my_business: 'Google My Business',
  facebook: 'Facebook',
  twitter: 'Twitter / X',
  youtube: 'YouTube',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  website_blog: 'Website blog',
};

async function loadGrid() {
  try {
    const [totalRow] = await db.select({ n: sql<number>`count(*)::int` }).from(clients);
    const total = totalRow?.n ?? 0;

    const counts = await db
      .select({
        channel: integrations.channel,
        connected: sql<number>`count(*) filter (where ${integrations.status} = 'connected')::int`,
        errored: sql<number>`count(*) filter (where ${integrations.status} = 'error')::int`,
      })
      .from(integrations)
      .groupBy(integrations.channel);
    return { total, counts };
  } catch {
    return { total: 0, counts: [] as Array<{ channel: string; connected: number; errored: number }> };
  }
}

export default async function IntegrationsPage() {
  const { total, counts } = await loadGrid();
  const countByChannel = new Map(counts.map((r) => [r.channel, r]));

  return (
    <Shell>
      <PageHeader
        title="Integrations"
        subtitle="Per-client OAuth + credentials for every channel Spider can publish to. OAuth wires up in phase 2."
        eyebrow="Channels"
      />
      <Page>
        {total === 0 ? (
          <Empty
            icon={<Plug size={28} />}
            title="No clients yet"
            hint="Import clients from Badger first; integrations live one-per-channel-per-client."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CHANNELS.map((channel) => {
              const stats = countByChannel.get(channel);
              const connected = stats?.connected ?? 0;
              const errored = stats?.errored ?? 0;
              return (
                <Card key={channel} className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-sm font-semibold text-fg">{CHANNEL_LABELS[channel]}</div>
                      <div className="text-xs text-muted mt-0.5">Channel</div>
                    </div>
                    <Badge tone={connected > 0 ? 'ok' : 'neutral'}>{connected > 0 ? 'live' : 'pending'}</Badge>
                  </div>
                  <div className="flex items-baseline gap-4 mt-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">Connected</div>
                      <div className="text-xl font-semibold text-fg tabular-nums leading-none mt-1">{connected}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">Of clients</div>
                      <div className="text-xl font-semibold text-muted tabular-nums leading-none mt-1">{total}</div>
                    </div>
                    {errored > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">Errors</div>
                        <div className="text-xl font-semibold text-err tabular-nums leading-none mt-1">{errored}</div>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Page>
    </Shell>
  );
}
