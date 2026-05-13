import { Shell } from '@/components/shell';
import { Page, PageHeader, StatTile, Card, SectionLabel, LinkButton } from '@/components/ui';
import { Users, Plug, Sparkles, FileText, ArrowRight } from 'lucide-react';
import { db } from '@/lib/db';
import { clients, integrations, contentItems } from '@/lib/db/schema';
import { count, eq } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function loadStats() {
  try {
    const [
      [clientsRow],
      [activeClientsRow],
      [integrationsRow],
      [contentRow],
      [draftsRow],
      [scheduledRow],
    ] = await Promise.all([
      db.select({ n: count() }).from(clients),
      db.select({ n: count() }).from(clients).where(eq(clients.status, 'active')),
      db.select({ n: count() }).from(integrations).where(eq(integrations.status, 'connected')),
      db.select({ n: count() }).from(contentItems).where(eq(contentItems.status, 'published')),
      db.select({ n: count() }).from(contentItems).where(eq(contentItems.status, 'draft')),
      db.select({ n: count() }).from(contentItems).where(eq(contentItems.status, 'scheduled')),
    ]);
    return {
      clients: clientsRow?.n ?? 0,
      activeClients: activeClientsRow?.n ?? 0,
      connectedIntegrations: integrationsRow?.n ?? 0,
      publishedContent: contentRow?.n ?? 0,
      drafts: draftsRow?.n ?? 0,
      scheduled: scheduledRow?.n ?? 0,
    };
  } catch {
    return { clients: 0, activeClients: 0, connectedIntegrations: 0, publishedContent: 0, drafts: 0, scheduled: 0 };
  }
}

export default async function DashboardPage() {
  const stats = await loadStats();
  return (
    <Shell>
      <PageHeader
        title="Spider"
        subtitle="One workspace per agency client. Channels on the left, content engine in the middle, growth dashboards on the right."
        eyebrow="Dashboard"
      />
      <Page>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="Clients"            value={stats.clients} hint={`${stats.activeClients} active`} icon={<Users size={14} />} />
          <StatTile label="Channels connected" value={stats.connectedIntegrations} hint="Across all clients" tone="info" icon={<Plug size={14} />} />
          <StatTile label="Drafts + scheduled" value={stats.drafts + stats.scheduled} hint={`${stats.drafts} draft · ${stats.scheduled} queued`} tone="accent" icon={<Sparkles size={14} />} />
          <StatTile label="Published"          value={stats.publishedContent} hint="All time" tone="ok" icon={<FileText size={14} />} />
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-6 lg:col-span-2">
            <SectionLabel className="mb-3">Where to start</SectionLabel>
            <div className="text-sm text-muted leading-relaxed space-y-3">
              <p>
                <strong className="text-fg">Open <Link href="/clients" className="text-accent hover:text-accent-strong">Clients</Link></strong> to see every dealership imported from Badger. Each client is a workspace with its own channels, voice profile, content library, and SEO state.
              </p>
              <p>
                <strong className="text-fg">For each client</strong> — connect their channels (Google My Business, Facebook, Twitter, YouTube, Instagram, LinkedIn, TikTok, or their own website blog), fill the voice profile, set target keywords, then flip status to active.
              </p>
              <p>
                <strong className="text-fg">From there autopilot takes over</strong> — daily AI-generated drafts arrive in the <Link href="/content" className="text-accent hover:text-accent-strong">library</Link>, you review and schedule them, and the publish cron fans them out every five minutes.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <LinkButton href="/clients" variant="primary"><Users size={14} />Open clients</LinkButton>
              <LinkButton href="/content"><FileText size={14} />Content library</LinkButton>
              <LinkButton href="/system" variant="ghost">System status<ArrowRight size={12} /></LinkButton>
            </div>
          </Card>

          <Card className="p-6">
            <SectionLabel className="mb-3">Loop</SectionLabel>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2.5">
                <Sparkles size={14} className="text-accent mt-0.5 flex-none" />
                <div>
                  <div className="text-fg font-medium">Generate</div>
                  <div className="text-xs text-muted leading-snug mt-0.5">Z.AI produces a daily content batch per client, tuned to their voice + niche.</div>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <FileText size={14} className="text-accent mt-0.5 flex-none" />
                <div>
                  <div className="text-fg font-medium">Curate</div>
                  <div className="text-xs text-muted leading-snug mt-0.5">Operator reviews drafts, edits per-channel variants, schedules.</div>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <Plug size={14} className="text-accent mt-0.5 flex-none" />
                <div>
                  <div className="text-fg font-medium">Publish</div>
                  <div className="text-xs text-muted leading-snug mt-0.5">Fan-out to every connected channel + IndexNow ping on website blog posts.</div>
                </div>
              </li>
            </ul>
          </Card>
        </div>
      </Page>
    </Shell>
  );
}
