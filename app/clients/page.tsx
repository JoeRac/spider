import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, Empty, Badge, Dot, LinkButton } from '@/components/ui';
import { Users, ArrowRight, Plug, Sparkles, CalendarClock, Search as SearchIcon, MapPin, AlertTriangle, Eye } from 'lucide-react';
import { db } from '@/lib/db';
import {
  clients, integrations, contentItems, contentTargets, seoAudits, CHANNELS, type Channel,
} from '@/lib/db/schema';
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import Link from 'next/link';
import { ImportFromBadgerButton } from './import-button';
import { listAdapters } from '@/lib/channels/registry';
import { computeClientHealth, healthTone, type ClientHealth } from '@/lib/client-health';
import { autopilotFromClientSettings } from '@/lib/content/autopilot';

export const dynamic = 'force-dynamic';

type StatusFilter = 'all' | 'active' | 'onboarding' | 'paused' | 'archived' | 'attention';

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const sp = await searchParams;
  const filter = (sp.filter ?? 'attention') as StatusFilter;

  const rows = await loadClientCards();
  const filtered = applyFilter(rows, filter);
  const counts = computeFilterCounts(rows);
  const attentionSummary = buildAttentionSummary(rows);

  return (
    <Shell>
      <PageHeader
        title="Leads"
        subtitle="Every dealership Spider is managing. Anything that needs you today is at the top."
        actions={<ImportFromBadgerButton />}
      />
      <Page>
        {/* Attention strip — the old dashboard's attention queue, hoisted to
            sit above the cards so this page is now the full morning briefing. */}
        {attentionSummary.total > 0 && (
          <div className="mb-5">
            <AttentionStrip summary={attentionSummary} />
          </div>
        )}

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
   Attention strip — the cross-client triage that used to live on the
   dashboard. Replaced raw counts with one-liner buttons that jump to
   the right filter or page.
   ────────────────────────────────────────────────────────────────────────── */

type AttentionSummary = {
  total: number;
  channelErrors: number;
  reviewQueue: number;        // total drafts awaiting bless
  lowSeo: number;
  onboarding: number;
};

function AttentionStrip({ summary }: { summary: AttentionSummary }) {
  return (
    <Card className="overflow-hidden border-warn/30 bg-warn-soft/20">
      <div className="px-5 py-3 border-b border-warn/30 bg-warn-soft/40 flex items-center gap-2">
        <AlertTriangle size={14} className="text-warn" />
        <span className="text-sm font-semibold text-fg">Needs attention</span>
        <Badge tone="warn">{summary.total}</Badge>
      </div>
      <div className="px-2 py-2 grid grid-cols-2 md:grid-cols-4 gap-1">
        <AttentionItem
          href="/clients?filter=onboarding"
          label="In onboarding"
          count={summary.onboarding}
          icon={<Users size={12} />}
          tone="info"
        />
        <AttentionItem
          href="/content?status=draft"
          label="To review"
          count={summary.reviewQueue}
          icon={<Eye size={12} />}
          tone="accent"
        />
        <AttentionItem
          href="/clients?filter=attention"
          label="Channel errors"
          count={summary.channelErrors}
          icon={<Plug size={12} />}
          tone="err"
        />
        <AttentionItem
          href="/seo"
          label="Low SEO (under 70)"
          count={summary.lowSeo}
          icon={<SearchIcon size={12} />}
          tone="warn"
        />
      </div>
    </Card>
  );
}

function AttentionItem({ href, label, count, icon, tone }: {
  href: string; label: string; count: number; icon: React.ReactNode;
  tone: 'info' | 'err' | 'warn' | 'accent';
}) {
  const muted = count === 0;
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-3 py-2 rounded-md hover:bg-bg/60 transition-colors ${muted ? 'opacity-60' : ''}`}
    >
      <span className={tone === 'err' ? 'text-err' : tone === 'warn' ? 'text-warn' : tone === 'accent' ? 'text-accent' : 'text-info'}>
        {icon}
      </span>
      <span className="flex-1 text-xs font-medium text-fg truncate">{label}</span>
      <Badge tone={muted ? 'neutral' : tone === 'accent' ? 'accent' : tone}>{count}</Badge>
    </Link>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   The card — visual workshop entry per client.
   ────────────────────────────────────────────────────────────────────────── */

function ClientCard({ row }: { row: ClientCardRow }) {
  const adapters = listAdapters();
  const labelByChannel = new Map(adapters.map((a) => [a.channel, a.label]));

  // Only show channels that have a row (configured). Slots that have
  // never been touched aren't visual noise on the card.
  const configuredChannels = row.channels;
  const liveCount = configuredChannels.filter((c) => c.status === 'connected').length;
  const erroredCount = configuredChannels.filter((c) => c.status === 'error' || c.status === 'expired').length;
  const unconfiguredCount = CHANNELS.length - configuredChannels.length;

  const cardAccent =
    row.attention === 'urgent' ? 'border-err/40' :
    row.attention === 'needs-work' ? 'border-warn/40' :
    row.attention === 'attention' ? 'border-info/40' :
    'border-border';

  return (
    <Card className={`overflow-hidden ${cardAccent}`} hoverable>
      <Link href={`/clients/${row.id}`} className="block">
        {/* Header band: name + health score + status */}
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
            <HealthBadge health={row.health} status={row.status} />
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

        {/* Channel rail — configured channels only + a tail count for the rest */}
        <div className="px-5 pt-3">
          <div className="text-[10px] uppercase tracking-wider text-faint font-semibold mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1"><Plug size={10} />Channels</span>
            <span className="text-fg tabular-nums">
              {liveCount}/{configuredChannels.length || '—'}
              {erroredCount > 0 && <span className="text-err ml-1.5">· {erroredCount} err</span>}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {configuredChannels.length === 0 ? (
              <span className="text-[11px] text-faint italic">No channels yet — open the Channels tab to connect</span>
            ) : (
              <>
                {configuredChannels.map((c) => {
                  const tone =
                    c.status === 'connected' ? 'bg-ok text-accent-fg' :
                    c.status === 'expired' || c.status === 'error' ? 'bg-err/20 text-err ring-1 ring-inset ring-err/30' :
                    'bg-subtle text-faint';
                  return (
                    <span
                      key={c.channel}
                      title={`${labelByChannel.get(c.channel) ?? c.channel}: ${c.status}`}
                      className={`inline-flex items-center justify-center w-7 h-5 rounded text-[9px] font-semibold uppercase tracking-wide ${tone}`}
                    >
                      {channelInitials(c.channel)}
                    </span>
                  );
                })}
                {unconfiguredCount > 0 && (
                  <span
                    title={`${unconfiguredCount} other channel${unconfiguredCount === 1 ? '' : 's'} available — not connected`}
                    className="inline-flex items-center justify-center px-1.5 h-5 rounded text-[9px] font-semibold uppercase tracking-wide bg-subtle text-faint"
                  >
                    +{unconfiguredCount}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Stats row — review-first */}
        <div className="px-5 pt-4 pb-3 grid grid-cols-4 gap-3">
          <Stat icon={<Eye size={11} />} label="Review" value={row.draftCount} tone={row.draftCount > 0 ? 'accent' : 'neutral'} />
          <Stat icon={<CalendarClock size={11} />} label="Sched" value={row.scheduledCount} tone="info" />
          <Stat icon={<ArrowRight size={11} />} label="Pub"   value={row.publishedCount} tone="ok" />
          <Stat icon={<SearchIcon size={11} />} label="SEO"   value={row.seoScore != null ? row.seoScore : '—'} tone={row.seoScore == null ? 'neutral' : row.seoScore >= 70 ? 'ok' : row.seoScore >= 50 ? 'warn' : 'err'} />
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

function HealthBadge({ health, status }: { health: ClientHealth; status: string }) {
  const tone = healthTone(health.label);
  const dot =
    status === 'archived' ? 'neutral' :
    status === 'paused' ? 'warn' :
    status === 'onboarding' ? 'info' :
    tone;
  return (
    <div className="flex items-center gap-2">
      <Badge tone={dot as 'ok' | 'warn' | 'err' | 'info' | 'neutral'}>
        <Dot tone={dot as 'ok' | 'warn' | 'err' | 'info' | 'neutral'} />
        {status}
      </Badge>
      <div className="text-right" title={`Channels ${health.factors.channels} · Velocity ${health.factors.velocity} · SEO ${health.factors.seo} · Autopilot ${health.factors.autopilot}`}>
        <div className="text-[9px] uppercase tracking-wider text-faint font-semibold">Health</div>
        <div className={`text-base font-semibold tabular-nums leading-none ${
          tone === 'ok' ? 'text-ok' :
          tone === 'warn' ? 'text-warn' :
          tone === 'err' ? 'text-err' :
          'text-muted'
        }`}>{health.score}</div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, tone }: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: 'ok' | 'warn' | 'err' | 'info' | 'neutral' | 'accent';
}) {
  const color =
    tone === 'ok' ? 'text-ok' :
    tone === 'warn' ? 'text-warn' :
    tone === 'err' ? 'text-err' :
    tone === 'info' ? 'text-info' :
    tone === 'accent' ? 'text-accent' :
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
  health: ClientHealth;
};

async function loadClientCards(): Promise<ClientCardRow[]> {
  const clientRows = await db.select().from(clients).orderBy(desc(clients.importedAt)).limit(500);
  if (clientRows.length === 0) return [];
  const ids = clientRows.map((c) => c.id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    integrationRows,
    contentCountRows,
    latestPublishedRows,
    publishedLast30Rows,
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

    // Publishes per client in the last 30 days — feeds the velocity factor
    // of the health score.
    db.select({
      clientId: contentItems.clientId,
      n: sql<number>`count(*)::int`,
    })
      .from(contentTargets)
      .innerJoin(contentItems, eq(contentItems.id, contentTargets.contentItemId))
      .where(and(
        inArray(contentItems.clientId, ids),
        eq(contentTargets.status, 'published'),
        gte(contentTargets.publishedAt, thirtyDaysAgo),
      ))
      .groupBy(contentItems.clientId),

    db.select({
      clientId: seoAudits.clientId,
      score: seoAudits.score,
      createdAt: seoAudits.createdAt,
    })
      .from(seoAudits)
      .where(inArray(seoAudits.clientId, ids))
      .orderBy(desc(seoAudits.createdAt)),
  ]);

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

  const last30ByClient = new Map<string, number>();
  for (const r of publishedLast30Rows) last30ByClient.set(r.clientId, r.n);

  const seoByClient = new Map<string, number>();
  for (const r of auditRows) {
    if (!seoByClient.has(r.clientId)) seoByClient.set(r.clientId, r.score);
  }

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
    const policy = autopilotFromClientSettings(c.settings);
    const publishedLast30 = last30ByClient.get(c.id) ?? 0;

    const attentionReasons: string[] = [];
    if (erroredCount > 0) attentionReasons.push(`${erroredCount} channel error`);
    if (c.status === 'onboarding') attentionReasons.push('onboarding');
    if (c.status === 'active' && liveCount === 0) attentionReasons.push('no channels live');
    if (c.status === 'active' && draftCount > 5) attentionReasons.push(`${draftCount} to review`);
    if (seoScore != null && seoScore < 70) attentionReasons.push(`SEO ${seoScore}`);

    const attention: ClientCardRow['attention'] =
      erroredCount > 0 ? 'urgent' :
      (seoScore != null && seoScore < 50) ? 'needs-work' :
      attentionReasons.length > 0 ? 'attention' : 'ok';

    const health = computeClientHealth({
      status: c.status,
      autopilotMode: policy.mode,
      connectedChannels: liveCount,
      publishedLast30d: publishedLast30,
      seoScore,
    });

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
      health,
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

function buildAttentionSummary(rows: ClientCardRow[]): AttentionSummary {
  let channelErrors = 0;
  let reviewQueue = 0;
  let lowSeo = 0;
  let onboarding = 0;
  for (const r of rows) {
    if (r.status === 'archived') continue;
    if (r.channels.some((c) => c.status === 'error' || c.status === 'expired')) channelErrors += 1;
    reviewQueue += r.draftCount;
    if (r.seoScore != null && r.seoScore < 70) lowSeo += 1;
    if (r.status === 'onboarding') onboarding += 1;
  }
  return {
    total: channelErrors + reviewQueue + lowSeo + onboarding,
    channelErrors, reviewQueue, lowSeo, onboarding,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────────────── */

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

void LinkButton; void Sparkles; void lt;
