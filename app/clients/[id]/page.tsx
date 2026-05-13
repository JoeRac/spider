import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, CardHeader, Badge, Dot, MetaList, Empty, SectionLabel } from '@/components/ui';
import { db } from '@/lib/db';
import {
  clients, integrations, contentItems, CHANNELS, type Channel,
  seoCitations, seoSitemaps,
} from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
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
import { OnboardingChecklist, type OnboardingStep } from './onboarding-checklist';
import { getProfile, latestAudit } from '@/lib/seo/audit';
import { CITATION_DIRECTORIES } from '@/lib/seo/citations';
import { ClientTabBar, type ClientTab } from './tab-bar';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = (asString(sp.tab) ?? 'overview') as ClientTab;

  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) notFound();

  const [
    integrationRows,
    contentCount,
    integrationCount,
  ] = await Promise.all([
    db.select().from(integrations).where(eq(integrations.clientId, id)),
    db.select({ n: sql<number>`count(*)::int` }).from(contentItems).where(eq(contentItems.clientId, id)),
    db.select({ n: sql<number>`count(*)::int` }).from(integrations).where(eq(integrations.clientId, id)),
  ]);

  const integrationError = asString(sp.integration_error);
  const integrationConnected = asString(sp.integration_connected);

  const tabCounts: Partial<Record<ClientTab, number>> = {
    channels: integrationCount[0]?.n ?? 0,
    content: contentCount[0]?.n ?? 0,
  };

  return (
    <Shell>
      <PageHeader
        breadcrumbs={[{ label: 'Clients', href: '/clients' }, { label: client.name }]}
        title={client.name}
        subtitle={[client.addressCity, client.addressState].filter(Boolean).join(', ') || undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={client.status === 'active' ? 'ok' : client.status === 'paused' ? 'warn' : 'info'}>
              <Dot tone={client.status === 'active' ? 'ok' : client.status === 'paused' ? 'warn' : 'info'} />
              {client.status}
            </Badge>
            <GenerateButton clientId={id} />
          </div>
        }
      />
      <ClientTabBar clientId={id} current={tab} counts={tabCounts} />

      <Page>
        {(integrationError || integrationConnected) && (
          <Banner tone={integrationError ? 'err' : 'ok'} message={integrationError ?? `${integrationConnected} connected`} />
        )}

        {tab === 'overview'  && <OverviewTab clientId={id} client={client} integrationRows={integrationRows} />}
        {tab === 'channels'  && <ChannelsTab clientId={id} client={client} integrationRows={integrationRows} />}
        {tab === 'content'   && <ContentTab clientId={id} client={client} />}
        {tab === 'seo'       && <SeoTab clientId={id} client={client} />}
      </Page>
    </Shell>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Tab content — each is a server-component fragment that fetches just what
   it needs. Splitting them keeps each tab's render fast even though they
   share the same page route.
   ────────────────────────────────────────────────────────────────────────── */

async function OverviewTab({ clientId, client, integrationRows }: {
  clientId: string;
  client: typeof clients.$inferSelect;
  integrationRows: Array<typeof integrations.$inferSelect>;
}) {
  // KPIs for the Overview header tiles.
  const [
    [draftRow],
    [scheduledRow],
    [publishedRow],
    [audit],
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(contentItems).where(eqAnd(contentItems.clientId, clientId, contentItems.status, 'draft')),
    db.select({ n: sql<number>`count(*)::int` }).from(contentItems).where(eqAnd(contentItems.clientId, clientId, contentItems.status, 'scheduled')),
    db.select({ n: sql<number>`count(*)::int` }).from(contentItems).where(eqAnd(contentItems.clientId, clientId, contentItems.status, 'published')),
    db.select().from(seoSitemaps).where(eq(seoSitemaps.clientId, clientId)).orderBy(desc(seoSitemaps.fetchedAt)).limit(1).then((r) => [r[0] ?? null]),
  ]);

  const connectedCount = integrationRows.filter((i) => i.status === 'connected').length;
  const latest = await latestAudit(clientId);
  const voice = voiceFromClientSettings(client.settings);
  const seoProfile = await getProfile(clientId);

  const onboardingSteps: OnboardingStep[] = [
    {
      key: 'channels',
      label: 'Connect at least one channel',
      detail: connectedCount > 0 ? `${connectedCount} channel${connectedCount === 1 ? '' : 's'} connected` : 'None connected yet',
      done: connectedCount > 0,
      href: `/clients/${clientId}?tab=channels`,
    },
    {
      key: 'voice',
      label: 'Fill in voice profile',
      detail: voice.niche ? `Niche: ${voice.niche}` : 'Niche, tone, audience, selling points',
      done: !!(voice.niche && voice.tone),
      href: `/clients/${clientId}?tab=content#voice`,
    },
    {
      key: 'seo',
      label: 'Set SEO target keywords',
      detail: (seoProfile?.targetKeywords?.length ?? 0) > 0
        ? `${seoProfile?.targetKeywords?.length} keyword${seoProfile?.targetKeywords?.length === 1 ? '' : 's'}`
        : 'None yet',
      done: (seoProfile?.targetKeywords?.length ?? 0) > 0,
      href: `/clients/${clientId}?tab=seo`,
    },
    {
      key: 'activate',
      label: 'Activate the client',
      detail: 'Flip status from onboarding → active so autopilot picks it up',
      done: client.status === 'active',
      href: `/clients/${clientId}`,
    },
  ];

  const recentContent = await db.select({
    id: contentItems.id, kind: contentItems.kind, title: contentItems.title,
    body: contentItems.body, status: contentItems.status, createdAt: contentItems.createdAt,
  }).from(contentItems).where(eq(contentItems.clientId, clientId)).orderBy(desc(contentItems.createdAt)).limit(5);

  return (
    <>
      {client.status === 'onboarding' && (
        <div className="mb-6">
          <OnboardingChecklist clientId={clientId} steps={onboardingSteps} status={client.status} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Tile label="Channels live" value={connectedCount} hint={`of ${integrationRows.length} configured`} />
        <Tile label="Drafts"        value={draftRow?.n ?? 0} />
        <Tile label="Scheduled"     value={scheduledRow?.n ?? 0} tone="info" />
        <Tile label="Published"     value={publishedRow?.n ?? 0} tone="ok" />
      </div>

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
              { label: <span className="inline-flex items-center gap-1.5"><Mail size={12} className="text-faint" />Email</span>, value: client.email ?? '—' },
              { label: <span className="inline-flex items-center gap-1.5"><MapPin size={12} className="text-faint" />City</span>, value: client.addressCity ?? '—' },
              { label: 'State', value: client.addressState ?? '—' },
              { label: 'Country', value: client.addressCountry ?? '—' },
              { label: 'Imported', value: new Date(client.importedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
            ]} />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent content"
            subtitle="Drafts + scheduled items generated for this client."
            action={<Link href={`/content?clientId=${clientId}`} className="text-xs text-muted hover:text-fg">View all →</Link>}
          />
          {recentContent.length === 0 ? (
            <div className="p-5">
              <Empty
                icon={<FileText size={24} />}
                title="No content yet"
                hint="Hit Generate content in the page header to spin up a batch."
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

      {latest && (
        <div className="mt-6">
          <SectionLabel className="mb-2">SEO snapshot</SectionLabel>
          <Card className="p-5 flex items-center gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">Audit score</div>
              <div className={`text-2xl font-semibold tabular-nums ${latest.score >= 70 ? 'text-ok' : latest.score >= 50 ? 'text-warn' : 'text-err'}`}>
                {latest.score}<span className="text-muted text-sm">/100</span>
              </div>
            </div>
            <div className="flex-1 text-xs text-muted">
              {(latest.findings ?? []).filter((f) => f.severity === 'fail').length} fail · {(latest.findings ?? []).filter((f) => f.severity === 'warn').length} warn
            </div>
            <Link href={`/clients/${clientId}?tab=seo`} className="text-xs text-accent hover:text-accent-strong">Open SEO tab →</Link>
          </Card>
        </div>
      )}
    </>
  );
}

async function ChannelsTab({ clientId, client, integrationRows }: {
  clientId: string;
  client: typeof clients.$inferSelect;
  integrationRows: Array<typeof integrations.$inferSelect>;
}) {
  void client;
  const adapters = listAdapters();
  const byChannel = new Map(integrationRows.map((i) => [i.channel, i]));
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
  const websiteBlogIntegration = integrationRows.find((i) => i.channel === 'website_blog');
  const websiteBlogMode = ((websiteBlogIntegration?.externalIds as Record<string, string> | undefined)?.webhook_url) ? 'webhook' : 'wordpress';

  return (
    <>
      <Card>
        <CardHeader title="Channels" subtitle="Connect each surface to start fanning out generated content." />
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          {cards.map((c) => (
            <ChannelCard key={c.channel} clientId={clientId} data={c} />
          ))}
        </div>
      </Card>

      <WebsiteBlogForm clientId={clientId} currentMode={websiteBlogIntegration ? websiteBlogMode : null} />
    </>
  );
}

async function ContentTab({ clientId, client }: { clientId: string; client: typeof clients.$inferSelect }) {
  const voice = voiceFromClientSettings(client.settings);
  const recentContent = await db.select({
    id: contentItems.id, kind: contentItems.kind, title: contentItems.title,
    body: contentItems.body, status: contentItems.status, createdAt: contentItems.createdAt,
    scheduledFor: contentItems.scheduledFor,
  }).from(contentItems).where(eq(contentItems.clientId, clientId)).orderBy(desc(contentItems.createdAt)).limit(20);

  return (
    <>
      <div id="voice" className="mb-6">
        <VoiceEditor clientId={clientId} initial={voice} />
      </div>

      <Card>
        <CardHeader
          title="Content"
          subtitle="Drafts, scheduled, and published items for this client."
          action={<Link href={`/content?clientId=${clientId}`} className="text-xs text-muted hover:text-fg">Full library →</Link>}
        />
        {recentContent.length === 0 ? (
          <div className="p-5">
            <Empty
              icon={<FileText size={24} />}
              title="No content yet"
              hint="Generate a batch with the button in the page header. Drafts arrive here for review."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {recentContent.map((r) => (
              <li key={r.id}>
                <Link href={`/content/${r.id}`} className="block px-5 py-3.5 hover:bg-subtle/40 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge tone={r.status === 'published' ? 'ok' : r.status === 'failed' ? 'err' : 'info'}>{r.status}</Badge>
                    <span className="text-[10px] uppercase tracking-wider text-faint font-semibold">{r.kind}</span>
                    {r.scheduledFor && (
                      <span className="text-[10px] text-muted">schedules {new Date(r.scheduledFor).toLocaleString()}</span>
                    )}
                    <span className="text-[10px] text-muted ml-auto">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="text-sm text-fg font-medium">{r.title ?? '(untitled)'}</div>
                  <div className="text-xs text-muted line-clamp-2 mt-0.5">{r.body.slice(0, 240)}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

async function SeoTab({ clientId, client }: { clientId: string; client: typeof clients.$inferSelect }) {
  const [profile, audit, citationRows, sitemapRows] = await Promise.all([
    getProfile(clientId),
    latestAudit(clientId),
    db.select().from(seoCitations).where(eq(seoCitations.clientId, clientId)),
    db.select().from(seoSitemaps).where(eq(seoSitemaps.clientId, clientId)).orderBy(desc(seoSitemaps.fetchedAt)).limit(20),
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

  return (
    <>
      <SeoPanel
        clientId={clientId}
        fallbackWebsite={client.website ?? null}
        initialProfile={profile ? {
          siteUrl: profile.siteUrl,
          primaryLocation: profile.primaryLocation,
          targetKeywords: profile.targetKeywords ?? [],
          schemaType: profile.schemaType,
          notes: profile.notes,
        } : null}
        initialAudit={audit ? {
          id: audit.id,
          score: audit.score,
          url: audit.url,
          findings: audit.findings ?? [],
          createdAt: new Date(audit.createdAt).toISOString(),
        } : null}
      />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CitationsCard clientId={clientId} items={citationItems} />
        <SitemapCard
          clientId={clientId}
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
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function Tile({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: 'ok' | 'info' | 'warn' | 'err' }) {
  const color =
    tone === 'ok' ? 'text-ok' :
    tone === 'info' ? 'text-info' :
    tone === 'warn' ? 'text-warn' :
    tone === 'err' ? 'text-err' :
    'text-fg';
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className={`mt-1 text-[22px] font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted mt-1">{hint}</div>}
    </Card>
  );
}

function asString(v: string | string[] | undefined): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0] ?? null;
  return null;
}

function eqAnd<A, B>(colA: A, valA: unknown, colB: B, valB: unknown) {
  // Convenience for the two-condition where used in the KPI count queries.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sql`${colA as any} = ${valA} and ${colB as any} = ${valB}`;
}
