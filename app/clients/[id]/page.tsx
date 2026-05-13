import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, CardHeader, Badge, Dot, MetaList, Empty } from '@/components/ui';
import { db } from '@/lib/db';
import { clients, integrations, contentItems, CHANNELS } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { MapPin, Globe, Phone, Mail, FileText } from 'lucide-react';
import Link from 'next/link';
import { listAdapters } from '@/lib/channels/registry';
import { ChannelCard, type ChannelCardData } from './channel-card';
import { WebsiteBlogForm } from './website-blog-form';
import { Banner } from './banner';
import { VoiceEditor } from './voice-editor';
import { GenerateButton } from './generate-button';
import { voiceFromClientSettings } from '@/lib/content/voice';
import { SeoPanel } from './seo-panel';
import { CitationsCard } from './citations-card';
import { SitemapCard } from './sitemap-card';
import { getProfile, latestAudit } from '@/lib/seo/audit';
import { seoCitations, seoSitemaps } from '@/lib/db/schema';
import { CITATION_DIRECTORIES } from '@/lib/seo/citations';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) notFound();

  const [existing, recentContent, seoProfile, seoAudit, citationRows, sitemapRows] = await Promise.all([
    db.select().from(integrations).where(eq(integrations.clientId, id)),
    db.select({
      id: contentItems.id, kind: contentItems.kind, title: contentItems.title,
      body: contentItems.body, status: contentItems.status, createdAt: contentItems.createdAt,
    }).from(contentItems).where(eq(contentItems.clientId, id)).orderBy(desc(contentItems.createdAt)).limit(8),
    getProfile(id),
    latestAudit(id),
    db.select().from(seoCitations).where(eq(seoCitations.clientId, id)),
    db.select().from(seoSitemaps).where(eq(seoSitemaps.clientId, id)).orderBy(desc(seoSitemaps.fetchedAt)).limit(20),
  ]);

  const citationByKey = new Map(citationRows.map((r) => [r.directoryKey, r]));
  const citationItems = CITATION_DIRECTORIES.map((d) => {
    const row = citationByKey.get(d.key);
    return {
      directory: d,
      status: (row?.status ?? 'missing') as 'missing' | 'partial' | 'complete' | 'na',
      url: row?.url ?? null,
      notes: row?.notes ?? null,
    };
  });

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
  const voice = voiceFromClientSettings(client.settings);

  return (
    <Shell>
      <PageHeader
        breadcrumbs={[{ label: 'Clients', href: '/clients' }, { label: client.name }]}
        title={client.name}
        subtitle={[client.addressCity, client.addressState].filter(Boolean).join(', ') || undefined}
        actions={<div className="flex items-center gap-2">
          <Badge tone={client.status === 'active' ? 'ok' : 'info'}><Dot tone={client.status === 'active' ? 'ok' : 'info'} />{client.status}</Badge>
          <GenerateButton clientId={id} />
        </div>}
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

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <VoiceEditor clientId={id} initial={voice} />

          <Card>
            <CardHeader
              title="Recent content"
              subtitle="Drafts + scheduled items generated for this client."
              action={<Link href={`/content?clientId=${id}`} className="text-xs text-muted hover:text-fg">View all →</Link>}
            />
            {recentContent.length === 0 ? (
              <div className="p-5">
                <Empty
                  icon={<FileText size={24} />}
                  title="No content yet"
                  hint="Use Generate content above to spin up a batch."
                />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recentContent.map((r) => (
                  <li key={r.id}>
                    <Link href={`/content/${r.id}`} className="block px-5 py-3 hover:bg-subtle/40 transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge tone={r.status === 'published' ? 'ok' : r.status === 'failed' ? 'err' : 'info'}>{r.status}</Badge>
                        <span className="text-[10px] uppercase tracking-wider text-faint font-semibold">{r.kind}</span>
                        <span className="text-[10px] text-muted ml-auto">{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="text-sm text-fg font-medium truncate">{r.title ?? r.body.slice(0, 80) + '…'}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CitationsCard clientId={id} items={citationItems} />
          <SitemapCard
            clientId={id}
            initialSnapshots={sitemapRows.map((s) => ({
              id: s.id,
              url: s.url,
              urlCount: s.urlCount,
              lastmodAt: s.lastmodAt ? new Date(s.lastmodAt).toISOString() : null,
              status: s.status,
              error: s.error,
              fetchedAt: new Date(s.fetchedAt).toISOString(),
            }))}
          />
        </div>

        <div className="mt-6">
          <SeoPanel
            clientId={id}
            fallbackWebsite={client.website ?? null}
            initialProfile={seoProfile ? {
              siteUrl: seoProfile.siteUrl,
              primaryLocation: seoProfile.primaryLocation,
              targetKeywords: seoProfile.targetKeywords ?? [],
              schemaType: seoProfile.schemaType,
              notes: seoProfile.notes,
            } : null}
            initialAudit={seoAudit ? {
              id: seoAudit.id,
              score: seoAudit.score,
              url: seoAudit.url,
              findings: seoAudit.findings ?? [],
              createdAt: new Date(seoAudit.createdAt).toISOString(),
            } : null}
          />
        </div>

        <WebsiteBlogForm clientId={id} currentMode={websiteBlogIntegration ? websiteBlogMode : null} />
      </Page>
    </Shell>
  );
}
