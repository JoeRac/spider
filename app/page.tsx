import { Shell } from '@/components/shell';
import { Page, PageHeader, StatTile, Card, SectionLabel } from '@/components/ui';
import { Users, Plug, Sparkles, FileText } from 'lucide-react';
import { db } from '@/lib/db';
import { clients, integrations, contentItems } from '@/lib/db/schema';
import { count, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

async function loadStats() {
  try {
    const [[clientsRow], [activeClientsRow], [integrationsRow], [contentRow]] = await Promise.all([
      db.select({ n: count() }).from(clients),
      db.select({ n: count() }).from(clients).where(eq(clients.status, 'active')),
      db.select({ n: count() }).from(integrations).where(eq(integrations.status, 'connected')),
      db.select({ n: count() }).from(contentItems).where(eq(contentItems.status, 'published')),
    ]);
    return {
      clients: clientsRow?.n ?? 0,
      activeClients: activeClientsRow?.n ?? 0,
      connectedIntegrations: integrationsRow?.n ?? 0,
      publishedContent: contentRow?.n ?? 0,
    };
  } catch {
    return { clients: 0, activeClients: 0, connectedIntegrations: 0, publishedContent: 0 };
  }
}

export default async function DashboardPage() {
  const stats = await loadStats();
  return (
    <Shell>
      <PageHeader
        title="Spider"
        subtitle="Workflow + content hub. Manage every channel for every client and let the content engine keep them in front of customers."
        eyebrow="Dashboard"
      />
      <Page>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="Clients"            value={stats.clients} hint="WON from Badger"           icon={<Users size={14} />} />
          <StatTile label="Active"             value={stats.activeClients}    hint="At least one channel live" tone="ok" icon={<Plug size={14} />} />
          <StatTile label="Channels connected" value={stats.connectedIntegrations} hint="Across all clients"    tone="info" icon={<Plug size={14} />} />
          <StatTile label="Content published"  value={stats.publishedContent} hint="All time"                  tone="accent" icon={<FileText size={14} />} />
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-6 lg:col-span-2">
            <SectionLabel className="mb-3">Roadmap</SectionLabel>
            <div className="text-sm text-muted leading-relaxed space-y-3">
              <p>
                <strong className="text-fg">Phase 1 (now)</strong> — Foundation. Spider is connected to Badger, ready to import every WON dealership as a Spider client. Schema in place for integrations, content, and jobs.
              </p>
              <p>
                <strong className="text-fg">Phase 2</strong> — Channel OAuth. Connect Google My Business, Facebook, Twitter, YouTube, Instagram, LinkedIn, TikTok, and the client&apos;s own website-blog. Per-client credential storage with refresh.
              </p>
              <p>
                <strong className="text-fg">Phase 3</strong> — Content engine. Z.AI GLM 4.6 generation pipeline with per-client templates and voice. Drafts arrive in the library; operator reviews; scheduling.
              </p>
              <p>
                <strong className="text-fg">Phase 4</strong> — Autopilot. Cron-driven daily generation + multi-channel publish fan-out. SEO publishing, backlinks, content versioning.
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <SectionLabel className="mb-3">Pipeline</SectionLabel>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2.5">
                <Sparkles size={14} className="text-accent mt-0.5 flex-none" />
                <div>
                  <div className="text-fg font-medium">Generate</div>
                  <div className="text-xs text-muted leading-snug mt-0.5">GLM 4.6 produces a daily content batch per client, tuned to their voice + niche.</div>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <FileText size={14} className="text-accent mt-0.5 flex-none" />
                <div>
                  <div className="text-fg font-medium">Curate</div>
                  <div className="text-xs text-muted leading-snug mt-0.5">Operator reviews drafts in the library, edits, schedules.</div>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <Plug size={14} className="text-accent mt-0.5 flex-none" />
                <div>
                  <div className="text-fg font-medium">Publish</div>
                  <div className="text-xs text-muted leading-snug mt-0.5">Fan-out to GMB, Facebook, Twitter, YouTube and any other connected channel.</div>
                </div>
              </li>
            </ul>
          </Card>
        </div>
      </Page>
    </Shell>
  );
}
