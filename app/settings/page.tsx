import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, CardHeader, MetaList, SectionLabel, Badge, Dot } from '@/components/ui';
import { config } from '@/lib/config';
import { listAdapters } from '@/lib/channels/registry';

export const dynamic = 'force-dynamic';

function maskKey(value: string): string {
  if (!value) return '—';
  if (value.length < 12) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

/**
 * Visibility into which OAuth apps are wired up on this server.
 * Doesn't expose secrets — just shows present/absent per env var.
 */
const OAUTH_APP_ENVS: Array<{ channel: string; label: string; envs: string[] }> = [
  { channel: 'google_my_business', label: 'Google (GMB + YouTube)', envs: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'] },
  { channel: 'facebook',           label: 'Meta (Facebook + Instagram)', envs: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'] },
  { channel: 'twitter',            label: 'Twitter / X',                  envs: ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'] },
  { channel: 'linkedin',           label: 'LinkedIn',                     envs: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'] },
  { channel: 'tiktok',             label: 'TikTok',                       envs: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'] },
];

export default function SettingsPage() {
  const adapters = listAdapters();
  const adaptersByChannel = new Map(adapters.map((a) => [a.channel, a]));

  return (
    <Shell>
      <PageHeader
        title="Settings"
        subtitle="Environment + OAuth app configuration. Values are masked; edit them in Vercel env or .env.local."
        eyebrow="Settings"
      />
      <Page max="5xl">
        <Card>
          <CardHeader title="Core" subtitle="Spider's own infra." />
          <div className="px-5 py-4">
            <MetaList items={[
              { label: 'Public URL',      value: config.publicUrl },
              { label: 'Database',        value: config.databaseUrl ? <span className="inline-flex items-center gap-1.5"><Dot tone="ok" />Configured</span> : <span className="text-faint">Not set</span> },
              { label: 'Encryption key',  value: process.env.INTEGRATION_ENCRYPTION_KEY ? <span className="inline-flex items-center gap-1.5"><Dot tone="ok" />Set</span> : <Badge tone="warn">dev fallback</Badge> },
            ]} />
          </div>
        </Card>

        <Card className="mt-6">
          <CardHeader title="OAuth applications" subtitle="One app per channel-group serves every Spider client. Register apps with the relevant provider, then add the client id + secret here." />
          <div className="px-5 py-4 space-y-3">
            {OAUTH_APP_ENVS.map((app) => {
              const allSet = app.envs.every((n) => !!process.env[n]);
              return (
                <div key={app.channel} className="flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-border bg-bg/40">
                  <div>
                    <div className="text-sm font-medium text-fg">{app.label}</div>
                    <div className="text-xs text-muted mt-0.5 font-mono">{app.envs.join(' + ')}</div>
                  </div>
                  <Badge tone={allSet ? 'ok' : 'neutral'}>
                    <Dot tone={allSet ? 'ok' : 'neutral'} />
                    {allSet ? 'configured' : 'not set'}
                  </Badge>
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-border bg-bg/40">
              <div>
                <div className="text-sm font-medium text-fg">Website blog</div>
                <div className="text-xs text-muted mt-0.5">No OAuth app required — operator configures per-client.</div>
              </div>
              <Badge tone="ok"><Dot tone="ok" />ready</Badge>
            </div>
          </div>
        </Card>

        <Card className="mt-6">
          <CardHeader title="Upstream services" />
          <div className="px-5 py-4">
            <MetaList items={[
              { label: 'Badger base URL', value: config.badgerBaseUrl },
              { label: 'Badger API key',  value: maskKey(config.badgerApiKey) },
              { label: 'Z.AI base URL',   value: config.zaiBaseUrl },
              { label: 'Z.AI model',      value: config.zaiModel },
              { label: 'Z.AI API key',    value: maskKey(config.zaiApiKey) },
            ]} />
          </div>
        </Card>

        <div className="mt-6">
          <SectionLabel className="mb-2">Channel adapters</SectionLabel>
          <Card className="p-5 text-sm text-muted leading-relaxed">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {adapters.map((a) => (
                <div key={a.channel} className="text-xs flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-bg/40 border border-border">
                  <span className="font-medium text-fg">{a.label}</span>
                  <span className="text-faint">{a.kind} · {a.refresh ? 'refreshable' : 'no refresh'}</span>
                </div>
              ))}
            </div>
            {adaptersByChannel.size !== adapters.length && (
              <div className="mt-3 text-xs text-warn">Adapter registry inconsistency detected.</div>
            )}
          </Card>
        </div>
      </Page>
    </Shell>
  );
}
