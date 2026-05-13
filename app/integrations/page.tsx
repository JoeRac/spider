import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, Badge, SectionLabel, LinkButton } from '@/components/ui';
import { Plug, Settings as SettingsIcon } from 'lucide-react';
import { db } from '@/lib/db';
import { clients, integrations } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { listAdapters } from '@/lib/channels/registry';

export const dynamic = 'force-dynamic';

async function loadGrid() {
  try {
    const [totalRow] = await db.select({ n: sql<number>`count(*)::int` }).from(clients);
    const total = totalRow?.n ?? 0;

    const counts = await db
      .select({
        channel: integrations.channel,
        connected: sql<number>`count(*) filter (where ${integrations.status} = 'connected')::int`,
        errored: sql<number>`count(*) filter (where ${integrations.status} = 'error')::int`,
        expired: sql<number>`count(*) filter (where ${integrations.status} = 'expired')::int`,
      })
      .from(integrations)
      .groupBy(integrations.channel);
    return { total, counts };
  } catch {
    return { total: 0, counts: [] as Array<{ channel: string; connected: number; errored: number; expired: number }> };
  }
}

export default async function IntegrationsPage() {
  const { total, counts } = await loadGrid();
  const countByChannel = new Map(counts.map((r) => [r.channel, r]));
  const adapters = listAdapters();

  return (
    <Shell>
      <PageHeader
        title="Integrations"
        subtitle="Per-channel OAuth status across every client. Configure OAuth apps in Settings; manage individual connections from the client detail page."
        eyebrow="Channels"
        actions={<LinkButton href="/settings" variant="secondary" size="sm"><SettingsIcon size={12} />OAuth app setup</LinkButton>}
      />
      <Page>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {adapters.map((adapter) => {
            const stats = countByChannel.get(adapter.channel);
            const connected = stats?.connected ?? 0;
            const errored = stats?.errored ?? 0;
            const expired = stats?.expired ?? 0;
            const configured = adapter.isConfigured();

            const tone =
              !configured && adapter.kind === 'oauth' ? 'warn' :
              connected > 0 ? 'ok' :
              'neutral';
            const label =
              !configured && adapter.kind === 'oauth' ? 'needs OAuth app' :
              connected > 0 ? 'live' :
              'idle';

            return (
              <Card key={adapter.channel} className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-fg flex items-center gap-2">
                      <Plug size={13} className="text-faint" />
                      {adapter.label}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {adapter.kind === 'oauth' ? 'OAuth · ' : 'Manual · '}
                      {adapter.scopes.length} scope{adapter.scopes.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </div>

                <div className="flex items-baseline gap-5 mt-4">
                  <Stat label="Connected" value={connected} tone="ok" />
                  <Stat label="of"        value={total}     tone="muted" />
                  {errored > 0 && <Stat label="Errors" value={errored} tone="err" />}
                  {expired > 0 && <Stat label="Expired" value={expired} tone="warn" />}
                </div>
              </Card>
            );
          })}
        </div>

        <div className="mt-6">
          <SectionLabel className="mb-2">How this works</SectionLabel>
          <Card className="p-5 text-sm text-muted leading-relaxed">
            <p>
              Spider is multi-tenant — one OAuth app per channel serves every Spider client.
              Configure each app once (client id + secret in Vercel env), and every dealership can
              connect their own GMB / FB / etc. accounts through Spider&apos;s consent screen.
            </p>
            <p className="mt-2">
              <strong className="text-fg">Required redirect URIs</strong> when registering each OAuth app
              (replace with the matching channel slug):
            </p>
            <pre className="mt-2 text-xs bg-subtle border border-border rounded p-3 overflow-x-auto">
              {`https://spider-ruddy.vercel.app/api/integrations/<channel>/callback`}
            </pre>
          </Card>
        </div>
      </Page>
    </Shell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' | 'err' | 'muted' }) {
  const color =
    tone === 'ok' ? 'text-ok' :
    tone === 'warn' ? 'text-warn' :
    tone === 'err' ? 'text-err' :
    'text-muted';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className={`text-xl font-semibold tabular-nums leading-none mt-1 ${color}`}>{value}</div>
    </div>
  );
}
