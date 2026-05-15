import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, Empty, Badge, Dot, LinkButton } from '@/components/ui';
import { Users, ArrowRight, Plug, Sparkles, CalendarClock, Search as SearchIcon, MapPin } from 'lucide-react';
import { db } from '@/lib/db';
import {
  clients, integrations, contentItems, contentTargets, seoAudits, CHANNELS, type Channel,
} from '@/lib/db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import Link from 'next/link';
import { ImportFromBadgerButton } from './import-button';
import { listAdapters } from '@/lib/channels/registry';

export const dynamic = 'force-dynamic';

type StatusFilter = 'all' | 'active' | 'onboarding' | 'paused' | 'archived' | 'attention';

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const sp = await searchParams;
  const filter = (sp.filter ?? 'attention') as StatusFilter;

  const rows = await loadClientCards();
  const filtered = applyFilter(rows, filter);
  const counts = computeFilterCounts(rows);

  return (
    <Shell>
      <PageHeader
        title="Clients"
        subtitle="Every dealership Spider is managing. The default view surfaces the ones that need you first."
        actions={<ImportFromBadgerButton />}
      />
      <Page>
        <FilterBar current={filter} counts={counts} />

        {filtered.length === 0 ? (
          <Empty
            icon={<Users size={28} />}
            title={filter === 'attention' ? 'Inbox zero on clients' : 'No clients in this view'}
            hint={
              filter === 'attention'
                ? 'Nothing needs your attention. Switch to All to see every client.'
                : rows.length === 0
                  ? 'Import every WON deal from Badger to bootstrap Spider. Safe to re-run.'
                  : 'Try a different filter above.'
            }
            action={rows.length === 0 ? <ImportFromBadgerButton /> : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((r) => <ClientCard key={r.id} row={r} />)}
          </div>
        )}
      </Page>
    </Shell>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   The card — visual workshop entry per client.
   ────────────────────────────────────────────────────────────────────────── */

function ClientCard({ row }: { row: ClientCardRow }) {
  const adapters = listAdapters();
  const channelMap = new Map(row.channels.map((c) => [c.channel, c.status]));
  const liveCount = row.channels.filter((c) => c.status === 'connected').length;
  const erroredCount = row.channels.filter((c) => c.status === 'error' || c.status === 'expired').length;

  const attention = row.attention;
  const cardAccent =
    attention === 'urgent' ? 'border-err/40' :
    attention === 'needs-work' ? 'border-warn/40' :
    attention === 'attention' ? 'border-info/40' :
    'border-border';

  return (
    <Card className={`overflow-hidden ${cardAccent}`} hoverable>
      <Link href={`/clients/${row.id}`} className="block">
        {/* Header band */}
        <div className="px-5 pt-4 pb-3 border-b border-border bg-bg/30">
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-fg truncate">{row.name}</div>
              {(row.city || row.state) && (
                <div className="text-xs text-muted mt-0.5 inline-flex items-center gap-1">
                  <MapPin size={11} className="text-faint" />
                  {[row.city, row.state].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
            <Badge tone={statusTone(row.status)}>
              <Dot tone={statusTone(row.status)} />
              {row.status}
            </Badge>
          </div>
          {row.attentionReasons.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {row.attentionReasons.slice(0, 3).map((r) => (
                <span key={r} className="inline-flex items-center px-1.5 h-5 rounded text-[10px] font-medium bg-warn-soft text-warn ring-1 ring-inset ring-warn/20">
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Channel rail */}
        <div className="px-5 pt-3">
          <div className="text-[10px] uppercase tracking-wider text-faint font-semibold mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1"><Plug size={10} />Channels</span>
            <span className="text-fg tabular-nums">{liveCount}/{CHANNELS.length}{erroredCount > 0 && <span className="text-err ml-1.5">· {erroredCount} err</span>}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {adapters.map((a) => {
              const st = channelMap.get(a.channel);
              const tone =
                st === 'connected' ? 'bg-ok text-accent-fg' :
                st === 'expired' || st === 'error' ? 'bg-err/20 text-err ring-1 ring-inset ring-err/30' :
                'bg-subtle text-faint';
              return (
                <span
                  key={a.channel}
                  title={`${a.label}: ${st ?? 'disconnected'}`}
                  className={`inline-flex items-center justify-center w-7 h-5 rounded text-[9px] font-semibold uppercase tracking-wide ${tone}`}
                >
                  {channelInitials(a.channel)}
                </span>
              );
            })}
          </div>
        </div>

        {/* Stats row */}
        <div className="px-5 pt-4 pb-3 grid grid-cols-4 gap-3">
          <Stat icon={<Sparkles size={11} />} label="Drafts"    value={row.draftCount} tone="neutral" />
          <Stat icon={<CalendarClock size={11} />} label="Sched" value={row.scheduledCount} tone="info" />
          <Stat icon={<ArrowRight size={11} />} label="Pub"      value={row.publishedCount} tone="ok" />
          <Stat icon={<SearchIcon size={11} />} label="SEO"      value={row.seoScore != null ? row.seoScore : '—'} tone={row.seoScore == null ? 'neutral' : row.seoScore >= 70 ? 'ok' : row.seoScore >= 50 ? 'warn' : 'err'} />
        </div>

        {/* Footer line */}
        <div className="px-5 py-2.5 border-t border-border bg-bg/20 flex items-center justify-between text-[11px] text-muted">
          <span>
            {row.lastPublishedAt
              ? <>last post {relative(row.lastPublishedAt)}{row.lastPublishedChannel ? ` · ${row.lastPublishedChannel}` : ''}</>
              : <span className="text-faint">no posts yet</span>}
          </span>
          <span className="inline-flex items-center gap-1 text-accent hover:text-accent-strong">Open <ArrowRight size={10} /></span>
        </div>
      </Link>
    </Card>
  );
}

function Stat({ icon, label, value, tone }: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: 'ok' | 'warn' | 'err' | 'info' | 'neutral';
}) {
  const color =
    tone === 'ok' ? 'text-ok' :
    tone === 'warn' ? 'text-warn' :
    tone === 'err' ? 'text-err' :
    tone === 'info' ? 'text-info' :
    'text-fg';
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-faint font-semibold inline-flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`text-[18px] font-semibold tabular-nums leading-none mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function FilterBar({ current, counts }: { current: StatusFilter; counts: Record<StatusFilter, number> }) {
  const chips: Array<{ key: StatusFilter; label: string }> = [
    { key: 'attention', label: 'Needs attention' },
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'onboarding', label: 'Onboarding' },
    { key: 'paused', label: 'Paused' },
    { key: 'archived', label: 'Archived' },
  ];
  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5">
      {chips.map((c) => {
        const active = current === c.key;
        const n = counts[c.key];
        return (
          <Link
            key={c.key}
            href={c.key === 'attention' ? '/clients' : `/clients?filter=${c.key}`}
            className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-medium border transition-colors duration-[120ms] ${
              active
                ? 'bg-accent-soft text-accent border-accent/30'
                : 'bg-panel text-muted border-border hover:bg-subtle hover:text-fg'
            }`}
          >
            {c.label}
            <span className={`tabular-nums text-[10px] ${active ? 'text-accent' : 'text-faint'}`}>{n}</span>
          </Link>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Data loading
   ────────────────────────────────────────────────────────────────────────── */

type ChannelStatus = { channel: Channel; status: string };

type ClientCardRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  status: string;
  channels: ChannelStatus[];
  draftCount: number;
  scheduledCount: number;
  publishedCount: number;
  seoScore: number | null;
  lastPublishedAt: Date | null;
  lastPublishedChannel: string | null;
  attention: 'urgent' | 'needs-work' | 'attention' | 'ok';
  attentionReasons: string[];
  importedAt: Date;
};

async function loadClientCards(): Promise<ClientCardRow[]> {
  // One pass: all clients.
  const clientRows = await db.select().from(clients).orderBy(desc(clients.importedAt)).limit(500);
  if (clientRows.length === 0) return [];
  const ids = clientRows.map((c) => c.id);

  // Parallel aggregate queries.
  const [
    integrationRows,
    contentCountRows,
    latestPublishedRows,
    auditRows,
  ] = await Promise.all([
    db.select({ clientId: integrations.clientId, channel: integrations.channel, status: integrations.status })
      .from(integrations).where(inArray(integrations.clientId, ids)),

    db.select({
      clientId: contentItems.clientId,
      status: contentItems.status,
      n: sql<number>`count(*)::int`,
    })
      .from(contentItems)
      .where(inArray(contentItems.clientId, ids))
      .groupBy(contentItems.clientId, contentItems.status),

    // Most recent successful publish per client — pull then reduce in JS.
    db.select({
      clientId: contentItems.clientId,
      publishedAt: contentTargets.publishedAt,
      channel: integrations.channel,
    })
      .from(contentTargets)
      .innerJoin(contentItems, eq(contentItems.id, contentTargets.contentItemId))
      .innerJoin(integrations, eq(integrations.id, contentTargets.integrationId))
      .where(and(inArray(contentItems.clientId, ids), eq(contentTargets.status, 'published')))
      .orderBy(desc(contentTargets.publishedAt))
      .limit(2000),

    // Latest audit score per client — pull and reduce.
    db.select({
      clientId: seoAudits.clientId,
      score: seoAudits.score,
      createdAt: seoAudits.createdAt,
    })
      .from(seoAudits)
      .where(inArray(seoAudits.clientId, ids))
      .orderBy(desc(seoAudits.createdAt)),
  ]);

  // Build per-client lookups.
  const channelsByClient = new Map<string, ChannelStatus[]>();
  for (const r of integrationRows) {
    const arr = channelsByClient.get(r.clientId) ?? [];
    arr.push({ channel: r.channel as Channel, status: r.status });
    channelsByClient.set(r.clientId, arr);
  }

  const countsByClient = new Map<string, Record<string, number>>();
  for (const r of contentCountRows) {
    const map = countsByClient.get(r.clientId) ?? {};
    map[r.status] = r.n;
    countsByClient.set(r.clientId, map);
  }

  const lastPubByClient = new Map<string, { at: Date; channel: string }>();
  for (const r of latestPublishedRows) {
    if (!lastPubByClient.has(r.clientId) && r.publishedAt) {
      lastPubByClient.set(r.clientId, { at: r.publishedAt, channel: r.channel });
    }
  }

  const seoByClient = new Map<string, number>();
  for (const r of auditRows) {
    if (!seoByClient.has(r.clientId)) seoByClient.set(r.clientId, r.score);
  }

  // Compose.
  return clientRows.map((c) => {
    const channels = channelsByClient.get(c.id) ?? [];
    const counts = countsByClient.get(c.id) ?? {};
    const lastPub = lastPubByClient.get(c.id) ?? null;
    const seoScore = seoByClient.get(c.id) ?? null;
    const liveCount = channels.filter((ch) => ch.status === 'connected').length;
    const erroredCount = channels.filter((ch) => ch.status === 'error' || ch.status === 'expired').length;
    const draftCount = counts.draft ?? 0;
    const scheduledCount = counts.scheduled ?? 0;
    const publishedCount = counts.published ?? 0;

    const attentionReasons: string[] = [];
    if (erroredCount > 0) attentionReasons.push(`${erroredCount} channel error`);
    if (c.status === 'onboarding') attentionReasons.push('onboarding');
    if (c.status === 'active' && liveCount === 0) attentionReasons.push('no channels live');
    if (c.status === 'active' && draftCount > 5) attentionReasons.push(`${draftCount} drafts pending`);
    if (seoScore != null && seoScore < 70) attentionReasons.push(`SEO ${seoScore}`);

    const attention: ClientCardRow['attention'] =
      erroredCount > 0 ? 'urgent' :
      (seoScore != null && seoScore < 50) ? 'needs-work' :
      attentionReasons.length > 0 ? 'attention' : 'ok';

    return {
      id: c.id,
      name: c.name,
      city: c.addressCity,
      state: c.addressState,
      status: c.status,
      channels,
      draftCount,
      scheduledCount,
      publishedCount,
      seoScore,
      lastPublishedAt: lastPub?.at ?? null,
      lastPublishedChannel: lastPub?.channel ?? null,
      attention,
      attentionReasons,
      importedAt: c.importedAt as Date,
    };
  });
}

function applyFilter(rows: ClientCardRow[], filter: StatusFilter): ClientCardRow[] {
  switch (filter) {
    case 'attention':  return rows.filter((r) => r.attention !== 'ok' && r.status !== 'archived');
    case 'all':        return rows;
    case 'active':     return rows.filter((r) => r.status === 'active');
    case 'onboarding': return rows.filter((r) => r.status === 'onboarding');
    case 'paused':     return rows.filter((r) => r.status === 'paused');
    case 'archived':   return rows.filter((r) => r.status === 'archived');
    default:           return rows;
  }
}

function computeFilterCounts(rows: ClientCardRow[]): Record<StatusFilter, number> {
  return {
    attention:  rows.filter((r) => r.attention !== 'ok' && r.status !== 'archived').length,
    all:        rows.length,
    active:     rows.filter((r) => r.status === 'active').length,
    onboarding: rows.filter((r) => r.status === 'onboarding').length,
    paused:     rows.filter((r) => r.status === 'paused').length,
    archived:   rows.filter((r) => r.status === 'archived').length,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────────────── */

function statusTone(status: string): 'ok' | 'warn' | 'err' | 'info' | 'neutral' | 'accent' {
  if (status === 'active') return 'ok';
  if (status === 'onboarding') return 'info';
  if (status === 'paused') return 'warn';
  return 'neutral';
}

function channelInitials(channel: string): string {
  switch (channel) {
    case 'google_my_business': return 'GMB';
    case 'facebook':           return 'FB';
    case 'twitter':            return 'X';
    case 'instagram':          return 'IG';
    case 'linkedin':           return 'LI';
    case 'youtube':            return 'YT';
    case 'tiktok':             return 'TT';
    case 'website_blog':       return 'WEB';
    default:                   return channel.slice(0, 2).toUpperCase();
  }
}

function relative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// LinkButton is exported for future use; suppress unused-export warnings via use.
void LinkButton;
