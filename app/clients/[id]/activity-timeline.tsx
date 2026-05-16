/**
 * Activity timeline — the single chronological feed for one client.
 *
 * Answers the operator question "is Spider actually doing good work
 * for this dealership?" in one glance, by merging five event streams:
 *
 *   - Content publishes (per channel, with external URL when known)
 *   - Content **publish failures** (per channel, with the lastError)
 *   - Content drafts (anything Z.AI produced)
 *   - SEO audits (with score)
 *   - Integration lifecycle (connected/expired/error) via audit_log
 *
 * Replaces the previous "Recent content" card which only showed
 * content_items by creation date and didn't reveal what actually went
 * live on which channel. Keeps the surface visually quiet: one
 * line per event, badge + truncated label + timestamp.
 *
 * Server-rendered; pulls 30 days back, caps at 20 rows after merge.
 */
import { db } from '@/lib/db';
import { contentItems, contentTargets, integrations, seoAudits, auditLog } from '@/lib/db/schema';
import { and, desc, eq, gte, or, sql } from 'drizzle-orm';
import Link from 'next/link';
import { Card, CardHeader, Empty, Badge, Dot } from '@/components/ui';
import { Activity, FileText, Send, Search, Plug, ExternalLink, AlertTriangle } from 'lucide-react';

const WINDOW_DAYS = 30;
const ROW_CAP = 20;

type TimelineRow = {
  ts: Date;
  kind: 'publish' | 'publish-failed' | 'draft' | 'audit' | 'integration';
  /** Per-row anchor — the entity the operator wants to click through to. */
  href: string | null;
  /** External URL (e.g. live tweet, GMB post) when available. */
  externalUrl: string | null;
  badge: string;
  badgeTone: 'ok' | 'info' | 'warn' | 'err' | 'accent' | 'neutral';
  title: string;
  detail: string | null;
  /** Per-row last-error blurb — only set on publish-failed rows. */
  errorDetail?: string | null;
};

export async function ActivityTimeline({ clientId }: { clientId: string }) {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [publishes, failedPublishes, drafts, audits, events] = await Promise.all([
    /* Publishes — every content_target that landed (status='published') in
     * the last 30d for this client. Joined to integrations for the channel,
     * to content_items for the title/kind. */
    db.select({
      id: contentTargets.id,
      contentItemId: contentTargets.contentItemId,
      publishedAt: contentTargets.publishedAt,
      externalUrl: contentTargets.externalUrl,
      channel: integrations.channel,
      title: contentItems.title,
      body: contentItems.body,
      kind: contentItems.kind,
    })
      .from(contentTargets)
      .innerJoin(contentItems, eq(contentItems.id, contentTargets.contentItemId))
      .innerJoin(integrations, eq(integrations.id, contentTargets.integrationId))
      .where(and(
        eq(contentItems.clientId, clientId),
        eq(contentTargets.status, 'published'),
        gte(contentTargets.publishedAt, since),
      ))
      .orderBy(desc(contentTargets.publishedAt))
      .limit(ROW_CAP),

    /* Failed publishes — content_targets that gave up (status='failed' →
     * dispatcher hit MAX_ATTEMPTS, see lib/publishers/dispatch.ts). These
     * never reached the dealership and the operator needs to see them so
     * silent failures aren't actually silent. We use updatedAt as the
     * timestamp because publishedAt is null on failure. */
    db.select({
      id: contentTargets.id,
      contentItemId: contentTargets.contentItemId,
      updatedAt: contentTargets.updatedAt,
      lastError: contentTargets.lastError,
      attempts: contentTargets.attempts,
      channel: integrations.channel,
      title: contentItems.title,
      body: contentItems.body,
      kind: contentItems.kind,
    })
      .from(contentTargets)
      .innerJoin(contentItems, eq(contentItems.id, contentTargets.contentItemId))
      .innerJoin(integrations, eq(integrations.id, contentTargets.integrationId))
      .where(and(
        eq(contentItems.clientId, clientId),
        eq(contentTargets.status, 'failed'),
        gte(contentTargets.updatedAt, since),
      ))
      .orderBy(desc(contentTargets.updatedAt))
      .limit(ROW_CAP),

    /* Drafts — content_items created in the window. We filter out items
     * that have already been published on at least one channel (those are
     * surfaced via the publishes stream above to avoid double-counting). */
    db.select({
      id: contentItems.id,
      kind: contentItems.kind,
      title: contentItems.title,
      body: contentItems.body,
      status: contentItems.status,
      createdAt: contentItems.createdAt,
    })
      .from(contentItems)
      .where(and(
        eq(contentItems.clientId, clientId),
        gte(contentItems.createdAt, since),
      ))
      .orderBy(desc(contentItems.createdAt))
      .limit(ROW_CAP),

    /* SEO audits in the window. */
    db.select({
      id: seoAudits.id,
      score: seoAudits.score,
      url: seoAudits.url,
      status: seoAudits.status,
      createdAt: seoAudits.createdAt,
    })
      .from(seoAudits)
      .where(and(eq(seoAudits.clientId, clientId), gte(seoAudits.createdAt, since)))
      .orderBy(desc(seoAudits.createdAt))
      .limit(ROW_CAP),

    /* Integration lifecycle events via audit_log. Only events whose
     * payload references the client OR whose targetType=integration with
     * the integration on this client. We match the simpler shape
     * (payload.clientId) which is how integration-store writes them. */
    db.select({
      id: auditLog.id,
      event: auditLog.event,
      actor: auditLog.actor,
      payload: auditLog.payload,
      createdAt: auditLog.createdAt,
    })
      .from(auditLog)
      .where(and(
        gte(auditLog.createdAt, since),
        or(
          sql`${auditLog.payload}->>'clientId' = ${clientId}`,
          and(eq(auditLog.targetType, 'client'), eq(auditLog.targetId, clientId)),
        )!,
      ))
      .orderBy(desc(auditLog.createdAt))
      .limit(ROW_CAP),
  ]);

  /* Merge into a single timeline. Drafts that became publishes are
   * de-duped: if a content_item shows up in the publishes set, we skip
   * the draft row for the same id so the operator sees the publish, not
   * the noise of "drafted then published" twice. */
  const publishedItemIds = new Set(publishes.map((p) => p.contentItemId));

  const rows: TimelineRow[] = [];

  for (const p of publishes) {
    if (!p.publishedAt) continue;
    rows.push({
      ts: p.publishedAt,
      kind: 'publish',
      href: `/content/${p.contentItemId}`,
      externalUrl: p.externalUrl ?? null,
      badge: shortChannel(p.channel),
      badgeTone: 'ok',
      title: p.title ?? p.body.slice(0, 90),
      detail: `${p.kind} published`,
    });
  }

  for (const f of failedPublishes) {
    if (!f.updatedAt) continue;
    rows.push({
      ts: f.updatedAt as Date,
      kind: 'publish-failed',
      href: `/content/${f.contentItemId}`,
      externalUrl: null,
      badge: shortChannel(f.channel),
      badgeTone: 'err',
      title: f.title ?? f.body.slice(0, 90),
      detail: `${f.kind} publish failed after ${f.attempts ?? 0} attempt${(f.attempts ?? 0) === 1 ? '' : 's'}`,
      errorDetail: f.lastError ?? null,
    });
  }

  for (const d of drafts) {
    if (publishedItemIds.has(d.id)) continue;
    if (d.status === 'archived') continue;
    rows.push({
      ts: d.createdAt as Date,
      kind: 'draft',
      href: `/content/${d.id}`,
      externalUrl: null,
      badge: d.status,
      badgeTone:
        d.status === 'failed' ? 'err' :
        d.status === 'scheduled' ? 'info' :
        d.status === 'published' ? 'ok' :
        'neutral',
      title: d.title ?? d.body.slice(0, 90),
      detail: `${d.kind} draft`,
    });
  }

  for (const a of audits) {
    rows.push({
      ts: a.createdAt as Date,
      kind: 'audit',
      href: `/clients/${clientId}?tab=seo`,
      externalUrl: null,
      badge: `${a.score}/100`,
      badgeTone: a.score >= 70 ? 'ok' : a.score >= 50 ? 'warn' : 'err',
      title: 'SEO audit',
      detail: a.url,
    });
  }

  for (const e of events) {
    // Skip events we already render through richer streams.
    if (e.event === 'content.drafted' || e.event === 'content.scheduled' || e.event === 'content.published') continue;
    rows.push({
      ts: e.createdAt as Date,
      kind: 'integration',
      href: `/clients/${clientId}?tab=channels`,
      externalUrl: null,
      badge: e.actor,
      badgeTone: 'accent',
      title: humanizeEvent(e.event),
      detail: e.event,
    });
  }

  rows.sort((a, b) => b.ts.getTime() - a.ts.getTime());
  const top = rows.slice(0, ROW_CAP);

  return (
    <Card>
      <CardHeader
        title="Activity"
        subtitle={`Last ${WINDOW_DAYS} days — every publish, failure, draft, audit, and integration event for this client.`}
        action={
          <div className="flex items-center gap-2">
            {failedPublishes.length > 0 && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-err-soft text-err ring-1 ring-inset ring-err/20"
                title="At least one channel rejected a publish after 4 retries. Click any 'publish failed' row below to see the lastError."
              >
                <AlertTriangle size={10} />
                {failedPublishes.length} failed publish{failedPublishes.length === 1 ? '' : 'es'}
              </span>
            )}
            <Link href={`/content?clientId=${clientId}`} className="text-xs text-muted hover:text-fg">All content →</Link>
          </div>
        }
      />
      {top.length === 0 ? (
        <div className="p-5">
          <Empty
            icon={<Activity size={24} />}
            title="Nothing yet"
            hint="Connect a channel, configure a cadence, and Spider will start publishing. The activity feed populates here as work happens."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {top.map((r, i) => <Row key={i} row={r} />)}
        </ul>
      )}
    </Card>
  );
}

function Row({ row }: { row: TimelineRow }) {
  const Inner = (
    <>
      <span className="flex-none mt-0.5">
        <IconForKind kind={row.kind} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge tone={row.badgeTone}>{row.badge}</Badge>
          {row.detail && <span className="text-[10px] uppercase tracking-wider text-faint font-semibold truncate">{row.detail}</span>}
          <span className="text-[10px] text-muted ml-auto inline-flex items-center gap-1">
            {relative(row.ts)}
            {row.externalUrl && (
              <a
                href={row.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-faint hover:text-accent"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={10} />
              </a>
            )}
          </span>
        </div>
        <div className="text-sm text-fg truncate">{row.title}</div>
        {row.errorDetail && (
          <div className="text-[11px] text-err truncate mt-0.5" title={row.errorDetail}>
            {row.errorDetail}
          </div>
        )}
      </div>
    </>
  );

  if (row.href) {
    return (
      <li>
        <Link href={row.href} className="flex items-start gap-3 px-5 py-2.5 hover:bg-subtle/40 transition-colors">
          {Inner}
        </Link>
      </li>
    );
  }
  return <li className="flex items-start gap-3 px-5 py-2.5">{Inner}</li>;
}

function IconForKind({ kind }: { kind: TimelineRow['kind'] }) {
  if (kind === 'publish')        return <Send size={13} className="text-ok" />;
  if (kind === 'publish-failed') return <AlertTriangle size={13} className="text-err" />;
  if (kind === 'draft')          return <FileText size={13} className="text-muted" />;
  if (kind === 'audit')          return <Search size={13} className="text-info" />;
  if (kind === 'integration')    return <Plug size={13} className="text-accent" />;
  return <Dot tone="neutral" />;
}

function shortChannel(c: string): string {
  switch (c) {
    case 'google_my_business': return 'GMB';
    case 'facebook':           return 'FB';
    case 'twitter':            return 'X';
    case 'instagram':          return 'IG';
    case 'linkedin':           return 'LI';
    case 'youtube':            return 'YT';
    case 'tiktok':             return 'TT';
    case 'website_blog':       return 'WEB';
    default:                   return c.slice(0, 3).toUpperCase();
  }
}

function humanizeEvent(event: string): string {
  switch (event) {
    case 'integration.connected':    return 'Channel connected';
    case 'integration.reconnected':  return 'Channel reconnected';
    case 'integration.disconnected': return 'Channel disconnected';
    case 'client.imported':          return 'Imported from Badger';
    case 'client.activated':         return 'Activated';
    default:
      return event.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function relative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1)  return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24)   return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7)     return `${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
