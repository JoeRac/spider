import { Shell } from '@/components/shell';
import { Page, PageHeader, StatTile, Card, CardHeader, Badge, Dot, Empty } from '@/components/ui';
import { Users, Plug, Sparkles, FileText, AlertTriangle, CalendarClock, CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/db';
import {
  clients, integrations, contentItems, contentTargets, seoAudits, auditLog,
} from '@/lib/db/schema';
import { and, count, desc, eq, gte, lt, ne, or, sql, isNull } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function loadDashboard() {
  const next24h = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [
    [allClients],
    [activeClients],
    [onboardingClients],
    [connectedChannelsRow],
    [draftsRow],
    [scheduledRow],
    [publishedRow],
    onboardingList,
    draftList,
    upcomingList,
    failedTargetList,
    expiredIntegrationList,
    lowScoreList,
    recentActivity,
  ] = await Promise.all([
    db.select({ n: count() }).from(clients),
    db.select({ n: count() }).from(clients).where(eq(clients.status, 'active')),
    db.select({ n: count() }).from(clients).where(eq(clients.status, 'onboarding')),
    db.select({ n: count() }).from(integrations).where(eq(integrations.status, 'connected')),
    db.select({ n: count() }).from(contentItems).where(eq(contentItems.status, 'draft')),
    db.select({ n: count() }).from(contentItems).where(eq(contentItems.status, 'scheduled')),
    db.select({ n: count() }).from(contentItems).where(eq(contentItems.status, 'published')),

    // Top 5 onboarding clients
    db.select({ id: clients.id, name: clients.name, city: clients.addressCity })
      .from(clients)
      .where(eq(clients.status, 'onboarding'))
      .orderBy(desc(clients.importedAt))
      .limit(5),

    // Top 5 drafts (most recent)
    db.select({
      id: contentItems.id,
      title: contentItems.title,
      body: contentItems.body,
      kind: contentItems.kind,
      clientId: contentItems.clientId,
      clientName: clients.name,
      createdAt: contentItems.createdAt,
    })
      .from(contentItems)
      .leftJoin(clients, eq(clients.id, contentItems.clientId))
      .where(eq(contentItems.status, 'draft'))
      .orderBy(desc(contentItems.createdAt))
      .limit(5),

    // Scheduled in next 24h
    db.select({
      id: contentItems.id,
      title: contentItems.title,
      body: contentItems.body,
      kind: contentItems.kind,
      clientId: contentItems.clientId,
      clientName: clients.name,
      scheduledFor: contentItems.scheduledFor,
    })
      .from(contentItems)
      .leftJoin(clients, eq(clients.id, contentItems.clientId))
      .where(and(
        eq(contentItems.status, 'scheduled'),
        or(isNull(contentItems.scheduledFor), lt(contentItems.scheduledFor, next24h))!,
      ))
      .orderBy(contentItems.scheduledFor)
      .limit(5),

    // Failed targets (status=failed)
    db.select({
      id: contentTargets.id,
      contentItemId: contentTargets.contentItemId,
      lastError: contentTargets.lastError,
      channel: integrations.channel,
      clientName: clients.name,
      clientId: clients.id,
      title: contentItems.title,
      body: contentItems.body,
    })
      .from(contentTargets)
      .innerJoin(integrations, eq(integrations.id, contentTargets.integrationId))
      .innerJoin(contentItems, eq(contentItems.id, contentTargets.contentItemId))
      .leftJoin(clients, eq(clients.id, contentItems.clientId))
      .where(eq(contentTargets.status, 'failed'))
      .orderBy(desc(contentTargets.updatedAt))
      .limit(5),

    // Expired or errored integrations
    db.select({
      id: integrations.id,
      channel: integrations.channel,
      status: integrations.status,
      clientId: clients.id,
      clientName: clients.name,
      lastError: integrations.lastError,
    })
      .from(integrations)
      .leftJoin(clients, eq(clients.id, integrations.clientId))
      .where(and(ne(integrations.status, 'connected'), ne(integrations.status, 'disconnected')))
      .limit(5),

    // SEO audits below 70
    db.select({
      id: seoAudits.id,
      clientId: seoAudits.clientId,
      clientName: clients.name,
      score: seoAudits.score,
      url: seoAudits.url,
      createdAt: seoAudits.createdAt,
    })
      .from(seoAudits)
      .leftJoin(clients, eq(clients.id, seoAudits.clientId))
      .where(lt(seoAudits.score, 70))
      .orderBy(desc(seoAudits.createdAt))
      .limit(5),

    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(8),
  ]);

  return {
    counts: {
      clients: allClients?.n ?? 0,
      active: activeClients?.n ?? 0,
      onboarding: onboardingClients?.n ?? 0,
      channels: connectedChannelsRow?.n ?? 0,
      drafts: draftsRow?.n ?? 0,
      scheduled: scheduledRow?.n ?? 0,
      published: publishedRow?.n ?? 0,
    },
    onboardingList,
    draftList,
    upcomingList,
    failedTargetList,
    expiredIntegrationList,
    lowScoreList,
    recentActivity,
  };
}

export default async function DashboardPage() {
  const data = await loadDashboard();
  const { counts } = data;

  const attentionTotal =
    data.onboardingList.length +
    data.failedTargetList.length +
    data.expiredIntegrationList.length +
    data.lowScoreList.length;

  return (
    <Shell>
      <PageHeader
        title="Spider"
        subtitle="One workspace per agency client. Below: what's blocking, what's queued, and what just shipped."
        eyebrow="Dashboard"
      />
      <Page>
        {/* Orientation tiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatTile label="Clients"            value={counts.clients}      hint={`${counts.active} active · ${counts.onboarding} onboarding`} icon={<Users size={14} />} />
          <StatTile label="Channels connected" value={counts.channels}     hint="Across all clients" tone="info" icon={<Plug size={14} />} />
          <StatTile label="Queued content"     value={counts.drafts + counts.scheduled} hint={`${counts.drafts} draft · ${counts.scheduled} scheduled`} tone="accent" icon={<Sparkles size={14} />} />
          <StatTile label="Published"          value={counts.published}    hint="All time" tone="ok" icon={<FileText size={14} />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Needs attention — issues + blockers */}
          <Card className="lg:col-span-2">
            <CardHeader
              title="Needs attention"
              subtitle={attentionTotal === 0 ? 'Nothing blocking right now.' : `${attentionTotal} item${attentionTotal === 1 ? '' : 's'} waiting on you.`}
            />
            <div className="divide-y divide-border">
              <AttentionGroup
                icon={<Users size={14} />}
                tone="info"
                label="Clients in onboarding"
                count={counts.onboarding}
                emptyHint="Every client is set up and active."
              >
                {data.onboardingList.map((c) => (
                  <Link key={c.id} href={`/clients/${c.id}`} className="block px-5 py-2 hover:bg-subtle/40 transition-colors">
                    <div className="text-sm text-fg">{c.name}</div>
                    <div className="text-xs text-muted">{c.city ?? '—'} · finish onboarding checklist</div>
                  </Link>
                ))}
              </AttentionGroup>

              <AttentionGroup
                icon={<AlertTriangle size={14} />}
                tone="err"
                label="Failed publishes"
                count={data.failedTargetList.length}
                emptyHint="No publish failures in the queue."
              >
                {data.failedTargetList.map((t) => (
                  <Link key={t.id} href={`/content/${t.contentItemId}`} className="block px-5 py-2 hover:bg-subtle/40 transition-colors">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge tone="err">{t.channel}</Badge>
                      <span className="text-fg truncate">{t.title ?? t.body?.slice(0, 80) ?? '(untitled)'}</span>
                    </div>
                    <div className="text-xs text-err mt-0.5 line-clamp-1">{t.lastError}</div>
                  </Link>
                ))}
              </AttentionGroup>

              <AttentionGroup
                icon={<Plug size={14} />}
                tone="warn"
                label="Integrations expired / errored"
                count={data.expiredIntegrationList.length}
                emptyHint="All connected channels are healthy."
              >
                {data.expiredIntegrationList.map((i) => (
                  <Link key={i.id} href={i.clientId ? `/clients/${i.clientId}?tab=channels` : '/system'} className="block px-5 py-2 hover:bg-subtle/40 transition-colors">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge tone={i.status === 'expired' ? 'warn' : 'err'}>{i.status}</Badge>
                      <span className="text-fg">{i.channel}</span>
                      <span className="text-muted">· {i.clientName}</span>
                    </div>
                    {i.lastError && <div className="text-xs text-muted line-clamp-1 mt-0.5">{i.lastError}</div>}
                  </Link>
                ))}
              </AttentionGroup>

              <AttentionGroup
                icon={<AlertTriangle size={14} />}
                tone="warn"
                label="Low SEO scores (under 70)"
                count={data.lowScoreList.length}
                emptyHint="Every audited site is at 70 or above."
              >
                {data.lowScoreList.map((a) => (
                  <Link key={a.id} href={a.clientId ? `/clients/${a.clientId}?tab=seo` : '/seo'} className="block px-5 py-2 hover:bg-subtle/40 transition-colors">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge tone={a.score >= 50 ? 'warn' : 'err'}>{a.score}/100</Badge>
                      <span className="text-fg">{a.clientName}</span>
                    </div>
                    <div className="text-xs text-muted line-clamp-1 mt-0.5">{a.url}</div>
                  </Link>
                ))}
              </AttentionGroup>
            </div>
          </Card>

          {/* Right column: drafts to review + upcoming */}
          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Drafts to review"
                subtitle="Generated content awaiting your nod."
                action={<Link href="/content?status=draft" className="text-xs text-muted hover:text-fg">All →</Link>}
              />
              {data.draftList.length === 0 ? (
                <div className="p-5">
                  <Empty icon={<Sparkles size={20} />} title="Inbox zero" hint="No drafts queued for review." />
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {data.draftList.map((d) => (
                    <li key={d.id}>
                      <Link href={`/content/${d.id}`} className="block px-5 py-2.5 hover:bg-subtle/40 transition-colors">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-[10px] uppercase tracking-wider text-faint font-semibold">{d.kind}</span>
                          <span className="text-muted">{d.clientName}</span>
                          <span className="text-faint ml-auto">{new Date(d.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="text-sm text-fg truncate">{d.title ?? d.body?.slice(0, 80) + '…'}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader
                title="Going out next 24h"
                subtitle="Scheduled content the cron will publish."
                action={<Link href="/content?view=calendar" className="text-xs text-muted hover:text-fg">Calendar →</Link>}
              />
              {data.upcomingList.length === 0 ? (
                <div className="p-5">
                  <Empty icon={<CalendarClock size={20} />} title="Nothing scheduled" hint="Schedule from the content detail page." />
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {data.upcomingList.map((u) => (
                    <li key={u.id}>
                      <Link href={`/content/${u.id}`} className="block px-5 py-2.5 hover:bg-subtle/40 transition-colors">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-[10px] uppercase tracking-wider text-faint font-semibold">{u.kind}</span>
                          <span className="text-muted">{u.clientName}</span>
                          <span className="text-faint ml-auto">
                            {u.scheduledFor ? new Date(u.scheduledFor).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'ASAP'}
                          </span>
                        </div>
                        <div className="text-sm text-fg truncate">{u.title ?? u.body?.slice(0, 80) + '…'}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        {/* Activity timeline */}
        <div className="mt-6">
          <Card>
            <CardHeader title="Recent activity" subtitle="audit_log across every client." />
            {data.recentActivity.length === 0 ? (
              <div className="px-5 py-5 text-sm text-muted">Nothing logged yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentActivity.map((e) => (
                  <li key={e.id} className="px-5 py-2.5 flex items-center gap-3 text-xs">
                    <Dot tone="accent" />
                    <span className="font-mono text-fg">{e.event}</span>
                    <span className="text-muted">{e.actor}</span>
                    <span className="text-faint ml-auto">{new Date(e.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Health quick-link */}
        <div className="mt-6 flex items-center justify-end">
          <Link href="/system" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
            <CheckCircle2 size={12} /> system health
          </Link>
        </div>
      </Page>
    </Shell>
  );
}

function AttentionGroup({
  icon, tone, label, count, emptyHint, children,
}: {
  icon: React.ReactNode;
  tone: 'info' | 'err' | 'warn';
  label: string;
  count: number;
  emptyHint: string;
  children: React.ReactNode;
}) {
  const dotTone = tone;
  return (
    <div>
      <div className="px-5 py-2.5 flex items-center gap-2 bg-subtle/30">
        <Dot tone={dotTone} />
        <span className="text-xs font-semibold text-fg">{label}</span>
        <Badge tone={count === 0 ? 'neutral' : tone}>{count}</Badge>
        {icon && <span className="ml-auto text-faint">{icon}</span>}
      </div>
      {count === 0 ? (
        <div className="px-5 py-3 text-xs text-muted">{emptyHint}</div>
      ) : (
        <div>{children}</div>
      )}
    </div>
  );
}

// Hush an unused import
void gte;
