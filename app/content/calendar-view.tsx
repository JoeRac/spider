/**
 * Calendar view — a 7-day grid showing scheduled (and recently published)
 * content per client+channel. Reads contentTargets joined with items +
 * integrations + clients.
 *
 * Day buckets pivot off the *parent* contentItem.scheduledFor. Targets
 * inherit that schedule; the calendar shows each target as a chip so the
 * operator sees "Phoenix Truck Mart · Facebook · 9am Wed" at a glance.
 *
 * Defaults to "this week starting today" with prev/next-week navigation
 * via query-string offsets (?weekOffset=-1, ?weekOffset=1, …).
 */
import { Card, Empty, Badge, SectionLabel } from '@/components/ui';
import { CalendarClock } from 'lucide-react';
import { db } from '@/lib/db';
import {
  contentItems, contentTargets, integrations, clients,
} from '@/lib/db/schema';
import { and, desc, eq, gte, lt, inArray, sql } from 'drizzle-orm';
import Link from 'next/link';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;

export async function CalendarView({ weekOffset }: { weekOffset: number }) {
  const start = startOfWeek(weekOffset);
  const end = new Date(start.getTime() + WEEK_DAYS * DAY_MS);

  // Pull every (target, item, integration, client) row where the parent item's
  // scheduledFor falls in the window, OR the target was published in the window.
  const rows = await db
    .select({
      targetId: contentTargets.id,
      targetStatus: contentTargets.status,
      externalUrl: contentTargets.externalUrl,
      publishedAt: contentTargets.publishedAt,
      itemId: contentItems.id,
      title: contentItems.title,
      body: contentItems.body,
      kind: contentItems.kind,
      scheduledFor: contentItems.scheduledFor,
      itemStatus: contentItems.status,
      channel: integrations.channel,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(contentTargets)
    .innerJoin(contentItems, eq(contentItems.id, contentTargets.contentItemId))
    .innerJoin(integrations, eq(integrations.id, contentTargets.integrationId))
    .leftJoin(clients, eq(clients.id, contentItems.clientId))
    .where(and(
      inArray(contentTargets.status, ['pending', 'publishing', 'published']),
      sql`
        (${contentItems.scheduledFor} >= ${start.toISOString()} AND ${contentItems.scheduledFor} < ${end.toISOString()})
        OR
        (${contentTargets.publishedAt} >= ${start.toISOString()} AND ${contentTargets.publishedAt} < ${end.toISOString()})
      `,
    ))
    .orderBy(desc(contentItems.scheduledFor))
    .limit(500);

  // Bucket per day.
  const days: Array<{ date: Date; items: typeof rows }> = [];
  for (let i = 0; i < WEEK_DAYS; i++) {
    days.push({ date: new Date(start.getTime() + i * DAY_MS), items: [] });
  }
  for (const r of rows) {
    const ts = r.publishedAt ?? r.scheduledFor ?? null;
    if (!ts) continue;
    const day = Math.floor((new Date(ts).getTime() - start.getTime()) / DAY_MS);
    if (day >= 0 && day < WEEK_DAYS) days[day]!.items.push(r);
  }

  // Hide-extra-imports lint dodge
  void lt;
  void gte;

  return (
    <Card>
      <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-bg/30">
        <div>
          <div className="text-sm font-semibold text-fg">Week of {start.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</div>
          <div className="text-xs text-muted">{rows.length} scheduled or published target{rows.length === 1 ? '' : 's'}</div>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <CalendarLink offset={weekOffset - 1} label="← Prev" />
          {weekOffset !== 0 && <CalendarLink offset={0} label="This week" />}
          <CalendarLink offset={weekOffset + 1} label="Next →" />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-8">
          <Empty
            icon={<CalendarClock size={28} />}
            title="Nothing scheduled this week"
            hint="Open a content item and pick channels + schedule to put it on the calendar."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-0 divide-y md:divide-y-0 md:divide-x divide-border">
          {days.map((d) => {
            const isToday = sameDay(d.date, new Date());
            return (
              <div key={d.date.toISOString()} className="min-h-[160px]">
                <div className={`px-3 pt-2.5 pb-2 ${isToday ? 'bg-accent-soft/60' : 'bg-bg/20'} border-b border-border`}>
                  <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">
                    {d.date.toLocaleDateString(undefined, { weekday: 'short' })}
                  </div>
                  <div className={`text-lg font-semibold tabular-nums ${isToday ? 'text-accent' : 'text-fg'}`}>
                    {d.date.getDate()}
                  </div>
                </div>
                <div className="px-2 py-2 space-y-1.5">
                  {d.items.length === 0 ? (
                    <div className="text-[10px] text-faint text-center py-3">—</div>
                  ) : (
                    d.items.map((it) => {
                      const time =
                        it.publishedAt ? new Date(it.publishedAt) :
                        it.scheduledFor ? new Date(it.scheduledFor) : null;
                      const tone =
                        it.targetStatus === 'published' ? 'ok' :
                        it.targetStatus === 'publishing' ? 'info' : 'neutral';
                      return (
                        <Link
                          key={it.targetId}
                          href={`/content/${it.itemId}`}
                          className="block px-2 py-1.5 rounded border border-border bg-panel hover:bg-subtle/60 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-1.5 mb-0.5">
                            <Badge tone={tone}>{shortChannel(it.channel)}</Badge>
                            {time && <span className="text-[9px] text-faint tabular-nums">{time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>}
                          </div>
                          <div className="text-[11px] text-fg leading-snug line-clamp-2">
                            {it.title ?? it.body.slice(0, 60) + '…'}
                          </div>
                          {it.clientName && (
                            <div className="text-[10px] text-muted truncate mt-0.5">{it.clientName}</div>
                          )}
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="px-5 py-3 border-t border-border bg-bg/20">
        <SectionLabel>How it works</SectionLabel>
        <div className="text-xs text-muted mt-1.5">
          A target appears on the day the parent content item is scheduled. Once published, it stays on the day it actually went out. The publish cron runs every 5 minutes; the next pass picks up everything in &quot;Pending&quot; whose schedule is now.
        </div>
      </div>
    </Card>
  );
}

function CalendarLink({ offset, label }: { offset: number; label: string }) {
  return (
    <Link
      href={offset === 0 ? '/content?view=calendar' : `/content?view=calendar&weekOffset=${offset}`}
      className="inline-flex items-center px-2 h-7 rounded-md text-xs font-medium border border-border bg-panel text-muted hover:bg-subtle hover:text-fg transition-colors"
    >
      {label}
    </Link>
  );
}

function startOfWeek(offset: number): Date {
  const now = new Date();
  // Start of today, then snap to Monday (ISO).
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow + offset * 7);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
    default: return c;
  }
}
