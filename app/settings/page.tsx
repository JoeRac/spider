import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, CardHeader, MetaList, SectionLabel } from '@/components/ui';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

function maskKey(value: string): string {
  if (!value) return '—';
  if (value.length < 12) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export default function SettingsPage() {
  return (
    <Shell>
      <PageHeader
        title="Settings"
        subtitle="Environment + integration credentials. Values are masked; edit them in Vercel env or .env.local."
        eyebrow="Settings"
      />
      <Page max="5xl">
        <Card>
          <CardHeader title="Connections" subtitle="Spider connects to Badger for client intake and Z.AI for generation." />
          <div className="px-5 py-4">
            <MetaList items={[
              { label: 'Badger base URL', value: config.badgerBaseUrl },
              { label: 'Badger API key',  value: maskKey(config.badgerApiKey) },
              { label: 'Z.AI base URL',   value: config.zaiBaseUrl },
              { label: 'Z.AI model',      value: config.zaiModel },
              { label: 'Z.AI API key',    value: maskKey(config.zaiApiKey) },
              { label: 'Public URL',      value: config.publicUrl },
            ]} />
          </div>
        </Card>

        <div className="mt-6">
          <SectionLabel className="mb-2">Roadmap notes</SectionLabel>
          <Card className="p-5">
            <div className="text-sm text-muted leading-relaxed space-y-2">
              <p>Phase 2 will add an OAuth-application section for each channel (client_id, redirect_uri, scopes).</p>
              <p>Phase 3 will add a generation-defaults section (default voice, daily quota, content kinds per channel).</p>
            </div>
          </Card>
        </div>
      </Page>
    </Shell>
  );
}
