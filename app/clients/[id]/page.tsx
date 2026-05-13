import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, CardHeader, Badge, Dot, MetaList, SectionLabel, LinkButton } from '@/components/ui';
import { db } from '@/lib/db';
import { clients, integrations, CHANNELS, type Channel } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { MapPin, Globe, Phone, Mail, Plug } from 'lucide-react';

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

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) notFound();

  const existing = await db.select().from(integrations).where(eq(integrations.clientId, id));
  const byChannel = new Map(existing.map((i) => [i.channel, i]));

  return (
    <Shell>
      <PageHeader
        breadcrumbs={[{ label: 'Clients', href: '/clients' }, { label: client.name }]}
        title={client.name}
        subtitle={[client.addressCity, client.addressState].filter(Boolean).join(', ') || undefined}
        actions={<Badge tone={client.status === 'active' ? 'ok' : 'info'}><Dot tone={client.status === 'active' ? 'ok' : 'info'} />{client.status}</Badge>}
      />
      <Page>
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
            <CardHeader
              title="Channels"
              subtitle="Connect each surface to start fanning out generated content. OAuth flows ship in phase 2."
              action={<LinkButton href="/integrations" size="sm" variant="ghost"><Plug size={12} />Manage</LinkButton>}
            />
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              {CHANNELS.map((channel) => {
                const integration = byChannel.get(channel);
                const status = integration?.status ?? 'disconnected';
                const tone =
                  status === 'connected' ? 'ok' :
                  status === 'error' ? 'err' :
                  status === 'expired' ? 'warn' : 'neutral';
                return (
                  <div key={channel} className="flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-border bg-bg/40">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-fg">{CHANNEL_LABELS[channel]}</div>
                      <div className="text-xs text-muted mt-0.5">
                        {integration?.lastSyncAt
                          ? `Last sync ${new Date(integration.lastSyncAt).toLocaleString()}`
                          : 'Not connected yet'}
                      </div>
                    </div>
                    <Badge tone={tone}>{status}</Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

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
