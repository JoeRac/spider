import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, Empty, Badge, LinkButton } from '@/components/ui';
import { FileText, Sparkles, ChevronRight } from 'lucide-react';
import { db } from '@/lib/db';
import { contentItems, clients } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, { label: string; tone: 'neutral' | 'ok' | 'warn' | 'err' | 'accent' | 'info' }> = {
  draft:     { label: 'Draft',     tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  published: { label: 'Published', tone: 'ok' },
  failed:    { label: 'Failed',    tone: 'err' },
  archived:  { label: 'Archived',  tone: 'neutral' },
};

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ status?: string; clientId?: string; kind?: string }> }) {
  const sp = await searchParams;

  const where = [];
  if (sp.status) where.push(eq(contentItems.status, sp.status));
  if (sp.clientId) where.push(eq(contentItems.clientId, sp.clientId));
  if (sp.kind) where.push(eq(contentItems.kind, sp.kind));

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
    })
    .from(contentItems)
    .leftJoin(clients, eq(clients.id, contentItems.clientId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(contentItems.createdAt))
    .limit(500);

  return (
    <Shell>
      <PageHeader
        title="Content library"
        subtitle="Every piece of generated content across all clients. Filter by status, kind, or client."
        eyebrow="Content"
        actions={<LinkButton href="/generation" variant="primary" size="sm"><Sparkles size={12} />Generate</LinkButton>}
      />
      <Page>
        <FilterBar current={sp} />

        {rows.length === 0 ? (
          <Empty
            icon={<FileText size={28} />}
            title="No content yet"
            hint="Generate a batch from the Generation page, or hit Generate from any client's detail view."
            action={<LinkButton href="/generation" variant="primary"><Sparkles size={14} />Open generation</LinkButton>}
          />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {rows.map((r) => {
                const label = STATUS_LABELS[r.status] ?? STATUS_LABELS.draft!;
                const preview = (r.title ?? r.body).slice(0, 220);
                return (
                  <li key={r.id}>
                    <Link href={`/content/${r.id}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-subtle/40 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge tone={label.tone}>{label.label}</Badge>
                          <span className="text-[10px] uppercase tracking-wider text-faint font-semibold">{r.kind}</span>
                          {r.clientName && (
                            <span className="text-xs text-muted">· <Link href={`/clients/${r.clientId}`} className="hover:text-accent">{r.clientName}</Link></span>
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
      </Page>
    </Shell>
  );
}

function FilterBar({ current }: { current: { status?: string; kind?: string } }) {
  const statuses = ['draft', 'scheduled', 'published', 'failed', 'archived'];
  const kinds = ['post', 'article', 'tweet', 'video_desc', 'reply'];
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-faint uppercase tracking-wider font-semibold">Status</span>
      <FilterChip label="All" href="/content" active={!current.status} />
      {statuses.map((s) => (
        <FilterChip key={s} label={s} href={`/content?status=${s}`} active={current.status === s} />
      ))}
      <span className="ml-3 text-faint uppercase tracking-wider font-semibold">Kind</span>
      <FilterChip label="All" href="/content" active={!current.kind} />
      {kinds.map((k) => (
        <FilterChip key={k} label={k} href={`/content?kind=${k}`} active={current.kind === k} />
      ))}
    </div>
  );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
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
