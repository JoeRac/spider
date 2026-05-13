import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, CardHeader, Badge, Dot, MetaList, SectionLabel } from '@/components/ui';
import { db } from '@/lib/db';
import { clients, integrations, CHANNELS, type Channel } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { MapPin, Globe, Phone, Mail } from 'lucide-react';
import { listAdapters } from '@/lib/channels/registry';
import { ChannelCard, type ChannelCardData } from './channel-card';
import { WebsiteBlogForm } from './website-blog-form';
import { Banner } from './banner';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) notFound();

  const existing = await db.select().from(integrations).where(eq(integrations.clientId, id));
  const byChannel = new Map(existing.map((i) => [i.channel, i]));

  const adapters = listAdapters();
  const cards: ChannelCardData[] = CHANNELS.map((channel) => {
    const adapter = adapters.find((a) => a.channel === channel)!;
    const row = byChannel.get(channel);
    return {
      channel,
      label: adapter.label,
      kind: adapter.kind,
      configured: adapter.isConfigured(),
      supportsRefresh: typeof adapter.refresh === 'function',
      integration: row ? {
        id: row.id,
        status: row.status,
        lastSyncAt: row.lastSyncAt ? new Date(row.lastSyncAt).toISOString() : null,
        lastError: row.lastError,
        externalIds: row.externalIds as Record<string, string>,
      } : null,
    };
  });

  const websiteBlogIntegration = existing.find((i) => i.channel === 'website_blog');
  const websiteBlogMode = ((websiteBlogIntegration?.externalIds as Record<string, string> | undefined)?.webhook_url) ? 'webhook' : 'wordpress';

  const integrationError = typeof sp.integration_error === 'string' ? sp.integration_error : null;
  const integrationConnected = typeof sp.integration_connected === 'string' ? sp.integration_connected : null;

  return (
    <Shell>
      <PageHeader
        breadcrumbs={[{ label: 'Clients', href: '/clients' }, { label: client.name }]}
        title={client.name}
        subtitle={[client.addressCity, client.addressState].filter(Boolean).join(', ') || undefined}
        actions={<Badge tone={client.status === 'active' ? 'ok' : 'info'}><Dot tone={client.status === 'active' ? 'ok' : 'info'} />{client.status}</Badge>}
      />
      <Page>
        {(integrationError || integrationConnected) && (
          <Banner tone={integrationError ? 'err' : 'ok'} message={integrationError ?? `${integrationConnected} connected`} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader title="Profile" subtitle="Imported from Badger" />
            <div className="px-5 py-4">
              <MetaList items={[
                { label: <span className="inline-flex items-center gap-1.5"><Globe size={12} className="text-faint" />Website</span>,
                  value: client.website
                    ? <a href={client.website} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors">{client.website.replace(/^https?:\/\//, '')}</a>
                    : '—' },
                { label: <span className="inline-flex items-center gap-1.5"><Phone size={12} className="text-faint" />Phone</span>, value: client.phone ?? '—' },
                { label: <span className="inline-flex items-center gap-1.5"><Mail  size={12} className="text-faint" />Email</span>, value: client.email ?? '—' },
                { label: <span className="inline-flex items-center gap-1.5"><MapPin size={12} className="text-faint" />City</span>,  value: client.addressCity ?? '—' },
                { label: 'State', value: client.addressState ?? '—' },
                { label: 'Country', value: client.addressCountry ?? '—' },
                { label: 'Imported', value: new Date(client.importedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
              ]} />
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Channels" subtitle="Connect each surface to start fanning out generated content." />
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              {cards.map((c) => (
                <ChannelCard key={c.channel} clientId={id} data={c} />
              ))}
            </div>
          </Card>
        </div>

        <WebsiteBlogForm clientId={id} currentMode={websiteBlogIntegration ? websiteBlogMode : null} />

        <div className="mt-6">
          <Card className="p-6">
            <SectionLabel className="mb-2">Description</SectionLabel>
            <div className="text-sm text-muted leading-relaxed">
              {client.description ?? <span className="text-faint italic">No description yet — add one to give the content engine context about this client&apos;s voice and niche.</span>}
            </div>
          </Card>
        </div>
      </Page>
    </Shell>
  );
}
