import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, CardHeader, SectionLabel, Badge, Dot, StatTile } from '@/components/ui';
import { Workflow, Sparkles, Send, CalendarClock } from 'lucide-react';
import { db } from '@/lib/db';
import { contentItems, contentTargets, clients, auditLog } from '@/lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { config } from '@/lib/config';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function WorkflowsPage() {
  const cronWired = !!config.cronSecret;

  const [
    [draftStats],
    [scheduledStats],
    [publishedStats],
    [failedTargets],
    recentEvents,
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(contentItems).where(eq(contentItems.status, 'draft')),
    db.select({ n: sql<number>`count(*)::int` }).from(contentItems).where(eq(contentItems.status, 'scheduled')),
    db.select({ n: sql<number>`count(*)::int` }).from(contentItems).where(eq(contentItems.status, 'published')),
    db.select({ n: sql<number>`count(*)::int` }).from(contentTargets).where(eq(contentTargets.status, 'failed')),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(15),
  ]);

  const activeClients = await db.select({ n: sql<number>`count(*)::int` }).from(clients).where(eq(clients.status, 'active'));

  return (
    <Shell>
      <PageHeader
        title="Workflows"
        subtitle="Autopilot status, cron health, and recent activity."
        eyebrow="Automation"
      />
      <Page>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatTile label="Draft"     value={draftStats?.n ?? 0}     hint="awaiting curation" icon={<Sparkles size={14} />} />
          <StatTile label="Scheduled" value={scheduledStats?.n ?? 0} hint="cron will publish" tone="info" icon={<CalendarClock size={14} />} />
          <StatTile label="Published" value={publishedStats?.n ?? 0} hint="across all channels" tone="ok" icon={<Send size={14} />} />
          <StatTile label="Failed"    value={failedTargets?.n ?? 0}  hint="targets after 4 attempts" tone="err" icon={<Workflow size={14} />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader title="Cron schedules" subtitle="Configured in vercel.json — Vercel hits these endpoints with the cron secret." />
            <div className="px-5 py-4 space-y-3 text-sm">
              <CronRow
                wired={cronWired}
                name="Publish fan-out"
                path="/api/cron/publish"
                schedule="*/5 * * * *"
                purpose="Picks due content_targets and posts them via each channel's publisher."
              />
              <CronRow
                wired={cronWired}
                name="Daily auto-generation"
                path="/api/cron/generate-daily"
                schedule="0 14 * * * (UTC)"
                purpose="Generates one local post per active client (configurable per-client quota)."
              />
              {!cronWired && (
                <div className="text-xs text-warn pt-2 border-t border-border">
                  Add CRON_SECRET to Vercel env to enable the cron worker. Without it, /api/cron/* returns 503.
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Coverage" subtitle="What the engine is operating on." />
            <div className="px-5 py-4 text-sm space-y-2 text-muted">
              <div className="flex justify-between"><span>Active clients</span><span className="text-fg font-semibold">{activeClients[0]?.n ?? 0}</span></div>
              <div className="flex justify-between"><span>Z.AI</span>{config.zaiApiKey ? <Badge tone="ok">configured</Badge> : <Badge tone="warn">missing key</Badge>}</div>
              <div className="flex justify-between"><span>Encryption key</span>{process.env.INTEGRATION_ENCRYPTION_KEY ? <Badge tone="ok">prod key</Badge> : <Badge tone="warn">dev fallback</Badge>}</div>
            </div>
          </Card>
        </div>

        <div className="mt-6">
          <SectionLabel className="mb-2">Recent activity</SectionLabel>
          <Card>
            {recentEvents.length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted">Nothing yet — once you import clients, connect channels, or schedule content, audit events land here.</div>
            ) : (
              <ul className="divide-y divide-border">
                {recentEvents.map((e) => (
                  <li key={e.id} className="px-5 py-2.5 flex items-center gap-3 text-xs">
                    <Dot tone="accent" />
                    <span className="font-mono text-fg">{e.event}</span>
                    <span className="text-muted">{e.actor}</span>
                    {e.targetId && <Link href={targetHref(e.targetType, e.targetId)} className="text-muted hover:text-accent ml-auto">{e.targetType}#{e.targetId.slice(0, 8)}</Link>}
                    <span className={`text-faint ${e.targetId ? '' : 'ml-auto'}`}>{new Date(e.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Page>
    </Shell>
  );
}

function CronRow({ name, path, schedule, purpose, wired }: { name: string; path: string; schedule: string; purpose: string; wired: boolean }) {
  return (
    <div className="rounded-md border border-border bg-bg/40 px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <div className="font-medium text-fg">{name}</div>
        <Badge tone={wired ? 'ok' : 'warn'}><Dot tone={wired ? 'ok' : 'warn'} />{wired ? 'wired' : 'CRON_SECRET missing'}</Badge>
      </div>
      <div className="text-xs text-muted font-mono">{path} · {schedule}</div>
      <div className="text-xs text-muted mt-1">{purpose}</div>
    </div>
  );
}

function targetHref(targetType: string | null, targetId: string): string {
  if (targetType === 'client') return `/clients/${targetId}`;
  if (targetType === 'integration') return `/integrations`;
  return '/';
}
