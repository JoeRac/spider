/**
 * Library view — the at-rest view of every content item across all
 * clients. Filter chips for status / kind / campaign drive the query.
 *
 * Was the old /content page; now lives as a view inside the /content
 * hub. The component is async and runs on the server.
 */
import { Card, Empty, Badge } from '@/components/ui';
import { FileText, ChevronRight } from 'lucide-react';
import { db } from '@/lib/db';
import { contentItems, clients } from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import Link from 'next/link';

const STATUS_LABELS: Record<string, { label: string; tone: 'neutral' | 'ok' | 'warn' | 'err' | 'accent' | 'info' }> = {
  draft:     { label: 'Draft',     tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  published: { label: 'Published', tone: 'ok' },
  failed:    { label: 'Failed',    tone: 'err' },
  archived:  { label: 'Archived',  tone: 'neutral' },
};

export async function LibraryView({
  status, kind, clientId, campaign,
}: {
  status?: string; kind?: string; clientId?: string; campaign?: string;
}) {
  const where = [];
  if (status)   where.push(eq(contentItems.status, status));
  if (kind)     where.push(eq(contentItems.kind, kind));
  if (clientId) where.push(eq(contentItems.clientId, clientId));
  if (campaign) where.push(sql`${contentItems.metadata} ->> 'campaign' = ${campaign}`);

  const rows = await db
    .select({
      id: contentItems.id,
      clientId: contentItems.clientId,
      clientName: clients.name,
      kind: contentItems.kind,
      title: contentItems.title,
      body: contentItems.body,
      status: contentItems.status,
      scheduledFor: contentItems.scheduledFor,
      createdAt: contentItems.createdAt,
      metadata: contentItems.metadata,
    })
    .from(contentItems)
    .leftJoin(clients, eq(clients.id, contentItems.clientId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(contentItems.createdAt))
    .limit(500);

  // Campaign chip data for the filter strip — distinct campaign values.
  const campaignRows = await db
    .select({ campaign: sql<string>`${contentItems.metadata} ->> 'campaign'` })
    .from(contentItems)
    .where(sql`${contentItems.metadata} ->> 'campaign' is not null`);
  const campaigns = Array.from(new Set(campaignRows.map((r) => r.campaign).filter(Boolean)));

  return (
    <>
      <FilterStrip current={{ status, kind, campaign }} campaigns={campaigns} />

      {rows.length === 0 ? (
        <Empty
          icon={<FileText size={28} />}
          title="No content matching this filter"
          hint="Loosen the filters above, or hop to Generate to spin up a new batch."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const label = STATUS_LABELS[r.status] ?? STATUS_LABELS.draft!;
              const preview = (r.title ?? r.body).slice(0, 220);
              const metaCampaign = ((r.metadata as Record<string, unknown> | null)?.campaign as string | undefined) ?? null;
              return (
                <li key={r.id}>
                  <Link href={`/content/${r.id}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-subtle/40 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge tone={label.tone}>{label.label}</Badge>
                        <span className="text-[10px] uppercase tracking-wider text-faint font-semibold">{r.kind}</span>
                        {r.clientName && (
                          <span className="text-xs text-muted">· <Link href={`/clients/${r.clientId}`} className="hover:text-accent">{r.clientName}</Link></span>
                        )}
                        {metaCampaign && (
                          <Link href={`/content?campaign=${encodeURIComponent(metaCampaign)}`} className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-soft text-accent ring-1 ring-inset ring-accent/20 hover:bg-accent-soft/80">
                            {metaCampaign}
                          </Link>
                        )}
                        {r.scheduledFor && (
                          <span className="text-xs text-muted">· schedules {new Date(r.scheduledFor).toLocaleString()}</span>
                        )}
                      </div>
                      <div className="text-sm text-fg font-medium truncate">{r.title ?? '(untitled)'}</div>
                      <div className="text-xs text-muted leading-snug mt-0.5 line-clamp-2">{preview}</div>
                    </div>
                    <ChevronRight size={14} className="text-faint mt-2 group-hover:text-fg transition-colors flex-none" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

function FilterStrip({ current, campaigns }: { current: { status?: string; kind?: string; campaign?: string }; campaigns: string[] }) {
  const statuses = ['draft', 'scheduled', 'published', 'failed', 'archived'];
  const kinds = ['post', 'article', 'tweet', 'video_desc', 'reply'];
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-faint uppercase tracking-wider font-semibold">Status</span>
        <Chip label="All" href="/content" active={!current.status} />
        {statuses.map((s) => (
          <Chip key={s} label={s} href={`/content?status=${s}`} active={current.status === s} />
        ))}
        <span className="ml-3 text-faint uppercase tracking-wider font-semibold">Kind</span>
        <Chip label="All" href="/content" active={!current.kind} />
        {kinds.map((k) => (
          <Chip key={k} label={k} href={`/content?kind=${k}`} active={current.kind === k} />
        ))}
      </div>
      {campaigns.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-faint uppercase tracking-wider font-semibold">Campaign</span>
          <Chip label="All" href="/content" active={!current.campaign} />
          {campaigns.map((c) => (
            <Chip key={c} label={c} href={`/content?campaign=${encodeURIComponent(c)}`} active={current.campaign === c} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center px-2 h-6 rounded text-[11px] font-medium border transition-colors duration-[120ms] ${
        active
          ? 'bg-accent-soft text-accent border-accent/30'
          : 'bg-panel text-muted border-border hover:bg-subtle hover:text-fg'
      }`}
    >
      {label}
    </Link>
  );
}
