/**
 * System — one page that absorbs the three legacy system surfaces that
 * used to be separate: /settings, /integrations, /workflows.
 *
 * Rationale: each of those was a partial view of "what does this server
 * know how to do, and what's working right now?" Splitting them across
 * three nav items meant the operator had to triangulate. One page with
 * clear sections is faster to scan and easier to keep coherent.
 *
 * Sections:
 *   1. Health      — Z.AI, DB, encryption, cron, IndexNow status
 *   2. Channels    — per-channel adapter: configured (env), live clients, errors
 *   3. Cron        — schedules + auth status
 *   4. Environment — env-var visibility + adapter inventory
 *   5. Activity    — recent audit log
 */
import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, CardHeader, MetaList, SectionLabel, Badge, Dot, StatTile } from '@/components/ui';
import { Database, Zap, Lock, Clock, BarChart3, Plug, Sparkles } from 'lucide-react';
import { config } from '@/lib/config';
import { listAdapters } from '@/lib/channels/registry';
import { db } from '@/lib/db';
import { clients, integrations, contentItems, contentTargets, auditLog } from '@/lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';

// 5-minute ISR — system health is observational, not transactional. The
// operator hitting refresh shouldn't re-run six aggregate queries against
// Neon every time.
export const revalidate = 300;

const OAUTH_APP_ENVS: Array<{ key: string; label: string; envs: string[] }> = [
  { key: 'google',   label: 'Google (GMB + YouTube)',       envs: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'] },
  { key: 'meta',     label: 'Meta (Facebook + Instagram)',  envs: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'] },
  { key: 'twitter',  label: 'Twitter / X',                  envs: ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'] },
  { key: 'linkedin', label: 'LinkedIn',                     envs: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'] },
  { key: 'tiktok',   label: 'TikTok',                       envs: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'] },
];

const CRON_SCHEDULES = [
  { path: '/api/cron/publish',          schedule: '*/5 * * * *',  purpose: 'Fan out due content_targets to each channel publisher.' },
  { path: '/api/cron/generate-daily',   schedule: '0 14 * * *',   purpose: 'One AI-generated post per active client.' },
  { path: '/api/cron/refresh-metrics',  schedule: '0 * * * *',    purpose: 'Pull engagement + follower counts from every connected channel.' },
  { path: '/api/cron/sitemap-refresh',  schedule: '0 6 * * *',    purpose: 'Snapshot every active client\'s sitemap.xml for SEO drift detection.' },
];

function mask(value: string): string {
  if (!value) return '—';
  if (value.length < 12) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export default async function SystemPage() {
  const adapters = listAdapters();

  const [
    [activeClientCount],
    [draftCount],
    [scheduledCount],
    [publishedCount],
    [failedTargetCount],
    channelCounts,
    recentEvents,
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(clients).where(eq(clients.status, 'active')),
    db.select({ n: sql<number>`count(*)::int` }).from(contentItems).where(eq(contentItems.status, 'draft')),
    db.select({ n: sql<number>`count(*)::int` }).from(contentItems).where(eq(contentItems.status, 'scheduled')),
    db.select({ n: sql<number>`count(*)::int` }).from(contentItems).where(eq(contentItems.status, 'published')),
    db.select({ n: sql<number>`count(*)::int` }).from(contentTargets).where(eq(contentTargets.status, 'failed')),
    db.select({
      channel: integrations.channel,
      connected: sql<number>`count(*) filter (where ${integrations.status} = 'connected')::int`,
      errored: sql<number>`count(*) filter (where ${integrations.status} = 'error')::int`,
      expired: sql<number>`count(*) filter (where ${integrations.status} = 'expired')::int`,
    }).from(integrations).groupBy(integrations.channel),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(15),
  ]);

  const channelCountMap = new Map(channelCounts.map((c) => [c.channel, c]));

  const dbOk = !!config.databaseUrl;
  const zaiOk = !!config.zaiApiKey;
  const encryptionOk = !!process.env.INTEGRATION_ENCRYPTION_KEY;
  const cronOk = !!config.cronSecret;
  const blobOk = !!process.env.BLOB_READ_WRITE_TOKEN;

  return (
    <Shell>
      <PageHeader
        title="System"
        subtitle="Connections, schedules, environment, and recent activity. One place to see what's wired and what's running."
        eyebrow="Admin"
      />
      <Page>
        {/* Top: health + autopilot stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatTile label="Active leads"   value={activeClientCount?.n ?? 0} icon={<Plug size={14} />} />
          <StatTile label="Drafts"         value={draftCount?.n ?? 0}        hint="Awaiting review" icon={<Sparkles size={14} />} />
          <StatTile label="Scheduled"      value={scheduledCount?.n ?? 0}    tone="info" hint="Queued for publish" icon={<Clock size={14} />} />
          <StatTile label="Failed targets" value={failedTargetCount?.n ?? 0} tone={failedTargetCount?.n ? 'err' : 'ok'} hint="After 4 attempts" icon={<BarChart3 size={14} />} />
        </div>

        {/* Health */}
        <Card className="mb-6">
          <CardHeader title="Health" subtitle="What's reachable from this Vercel deployment." />
          <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <HealthRow icon={<Database size={14} />}      label="Database"      ok={dbOk}          hint={dbOk ? 'Neon connected' : 'DATABASE_URL missing'} />
            <HealthRow icon={<Zap size={14} />}            label="Z.AI"          ok={zaiOk}         hint={zaiOk ? config.zaiModel : 'ZAI_API_KEY missing'} />
            <HealthRow icon={<Lock size={14} />}           label="Encryption"    ok={encryptionOk}  hint={encryptionOk ? 'Prod key set' : 'Dev fallback'} />
            <HealthRow icon={<Clock size={14} />}          label="Cron auth"     ok={cronOk}        hint={cronOk ? 'Secret wired' : 'CRON_SECRET missing'} />
            <HealthRow icon={<Sparkles size={14} />}       label="Blob storage"  ok={blobOk}        hint={blobOk ? 'Vercel Blob linked' : 'BLOB_READ_WRITE_TOKEN missing'} />
          </div>
        </Card>

        {/* Channels — per-channel adapter status */}
        <Card className="mb-6">
          <CardHeader title="Channels" subtitle="Per-channel adapter readiness + live connection counts across all clients." />
          <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {adapters.map((adapter) => {
              const counts = channelCountMap.get(adapter.channel);
              const connected = counts?.connected ?? 0;
              const errored = counts?.errored ?? 0;
              const expired = counts?.expired ?? 0;
              const configured = adapter.isConfigured();
              return (
                <div key={adapter.channel} className="rounded-md border border-border bg-bg/40 px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-medium text-fg">{adapter.label}</div>
                    {configured
                      ? <Badge tone="ok"><Dot tone="ok" />ready</Badge>
                      : <Badge tone="warn"><Dot tone="warn" />setup</Badge>}
                  </div>
                  <div className="text-xs text-muted flex items-center gap-3">
                    <span>{adapter.kind === 'oauth' ? 'OAuth' : 'Manual'}</span>
                    <span className="text-fg tabular-nums">{connected}</span><span className="text-faint">connected</span>
                    {errored > 0 && <><span className="text-err tabular-nums">{errored}</span><span className="text-faint">err</span></>}
                    {expired > 0 && <><span className="text-warn tabular-nums">{expired}</span><span className="text-faint">expired</span></>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Cron schedules */}
        <Card className="mb-6">
          <CardHeader title="Cron" subtitle="Vercel cron schedules. Endpoints fail-closed with 503 if CRON_SECRET is unset." />
          <div className="px-5 py-4 space-y-2">
            {CRON_SCHEDULES.map((c) => (
              <div key={c.path} className="rounded-md border border-border bg-bg/40 px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-medium text-fg font-mono">{c.path}</div>
                  <Badge tone={cronOk ? 'ok' : 'warn'}><Dot tone={cronOk ? 'ok' : 'warn'} />{cronOk ? 'wired' : 'CRON_SECRET missing'}</Badge>
                </div>
                <div className="text-xs text-muted">
                  <span className="font-mono">{c.schedule}</span>
                  <span className="ml-3">{c.purpose}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Environment + OAuth app config */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardHeader title="OAuth applications" subtitle="One app per channel-group serves every Spider client." />
            <div className="px-5 py-4 space-y-2">
              {OAUTH_APP_ENVS.map((app) => {
                const allSet = app.envs.every((n) => !!process.env[n]);
                return (
                  <div key={app.key} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border bg-bg/40">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-fg">{app.label}</div>
                      <div className="text-[11px] text-muted font-mono truncate">{app.envs.join(' + ')}</div>
                    </div>
                    <Badge tone={allSet ? 'ok' : 'neutral'}><Dot tone={allSet ? 'ok' : 'neutral'} />{allSet ? 'configured' : 'not set'}</Badge>
                  </div>
                );
              })}
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border bg-bg/40">
                <div>
                  <div className="text-sm font-medium text-fg">Website blog</div>
                  <div className="text-[11px] text-muted">Per-client manual config (WordPress / webhook).</div>
                </div>
                <Badge tone="ok"><Dot tone="ok" />ready</Badge>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Environment" subtitle="Upstream services + public URL." />
            <div className="px-5 py-4">
              <MetaList items={[
                { label: 'Public URL',      value: config.publicUrl },
                { label: 'Badger base URL', value: config.badgerBaseUrl },
                { label: 'Badger API key',  value: mask(config.badgerApiKey) },
                { label: 'Z.AI base URL',   value: config.zaiBaseUrl },
                { label: 'Z.AI model',      value: config.zaiModel },
                { label: 'Z.AI API key',    value: mask(config.zaiApiKey) },
                { label: 'IndexNow key',    value: process.env.INDEXNOW_KEY ? 'set' : 'not set' },
              ]} />
            </div>
          </Card>
        </div>

        {/* Adapter / publisher inventory + recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader title="Adapter inventory" subtitle="What the registry can do per channel." />
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {adapters.map((a) => (
                <div key={a.channel} className="text-xs flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-bg/40 border border-border">
                  <span className="font-medium text-fg">{a.label}</span>
                  <span className="text-faint">{a.kind} · {a.refresh ? 'refreshable' : 'no refresh'}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent activity" subtitle="audit_log — most recent 15 events." />
            <div className="px-5 py-2">
              {recentEvents.length === 0 ? (
                <div className="py-3 text-xs text-muted">Nothing yet.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {recentEvents.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 py-2 text-xs">
                      <Dot tone="accent" />
                      <span className="font-mono text-fg">{e.event}</span>
                      <span className="text-muted">{e.actor}</span>
                      <span className="ml-auto text-faint">{new Date(e.createdAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="mt-6">
          <SectionLabel className="mb-2">Output</SectionLabel>
          <Card className="p-5 text-sm text-muted">
            Drafts {draftCount?.n ?? 0} · Scheduled {scheduledCount?.n ?? 0} · Published {publishedCount?.n ?? 0}. Failed targets cap at 4 attempts before locking to <code className="font-mono text-xs bg-bg px-1.5 py-0.5 rounded border border-border">failed</code>.
          </Card>
        </div>
      </Page>
    </Shell>
  );
}

function HealthRow({ icon, label, ok, hint }: { icon: React.ReactNode; label: string; ok: boolean; hint: string }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border bg-bg/40">
      <span className={ok ? 'text-ok' : 'text-warn'}>{icon}</span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-fg">{label}</div>
        <div className="text-[10px] text-muted truncate">{hint}</div>
      </div>
      <Dot tone={ok ? 'ok' : 'warn'} />
    </div>
  );
}
