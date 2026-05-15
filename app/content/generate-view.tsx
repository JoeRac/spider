/**
 * Generate view — the bulk-generation console. Imports the channel-first
 * GenerationConsole client component; renders alongside template hints
 * (kept around as reference; the operator no longer picks kinds directly).
 */
import { Card, CardHeader, Badge, Dot, SectionLabel } from '@/components/ui';
import { Sparkles } from 'lucide-react';
import { db } from '@/lib/db';
import { clients, integrations, type Channel } from '@/lib/db/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { GenerationConsole } from './generation-console';
import { config } from '@/lib/config';
import { TEMPLATES } from '@/lib/content/templates';
import { listAdapters } from '@/lib/channels/registry';

export async function GenerateView() {
  // Active clients first; fall back to all clients if none are active yet.
  const activeClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.status, 'active'))
    .orderBy(asc(clients.name));
  const clientList = activeClients.length > 0
    ? activeClients
    : await db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name));

  // For each client, pull their connected channels so the console can
  // render a channel select instead of asking for a content kind.
  const ids = clientList.map((c) => c.id);
  const integrationRows = ids.length === 0 ? [] : await db
    .select({ clientId: integrations.clientId, channel: integrations.channel })
    .from(integrations)
    .where(and(inArray(integrations.clientId, ids), eq(integrations.status, 'connected')));

  const adapters = listAdapters();
  const labelByChannel = new Map(adapters.map((a) => [a.channel, a.label]));

  const channelsByClient = new Map<string, Array<{ channel: Channel; label: string }>>();
  for (const r of integrationRows) {
    const list = channelsByClient.get(r.clientId) ?? [];
    list.push({ channel: r.channel as Channel, label: labelByChannel.get(r.channel as Channel) ?? r.channel });
    channelsByClient.set(r.clientId, list);
  }

  const clientOptions = clientList.map((c) => ({
    id: c.id,
    name: c.name,
    channels: channelsByClient.get(c.id) ?? [],
  }));

  const zaiReady = !!config.zaiApiKey;

  return (
    <>
      {!zaiReady && (
        <Card className="p-5 mb-5 border-warn/30 bg-warn-soft/50">
          <SectionLabel className="mb-2">Configuration required</SectionLabel>
          <div className="text-sm text-muted leading-relaxed">
            Add <code className="bg-bg px-1.5 py-0.5 rounded border border-border font-mono text-[12px]">ZAI_API_KEY</code> to your Vercel env to enable generation. Model defaults to{' '}
            <code className="bg-bg px-1.5 py-0.5 rounded border border-border font-mono text-[12px]">{config.zaiModel}</code>; override with <code className="bg-bg px-1.5 py-0.5 rounded border border-border font-mono text-[12px]">ZAI_MODEL</code>.
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Generation console</SectionLabel>
            <Badge tone={zaiReady ? 'ok' : 'warn'}><Dot tone={zaiReady ? 'ok' : 'warn'} />{zaiReady ? 'Z.AI ready' : 'ZAI_API_KEY missing'}</Badge>
          </div>
          <GenerationConsole clients={clientOptions} disabled={!zaiReady} defaultModel={config.zaiModel} />
        </div>
        <Card>
          <CardHeader title="Templates" subtitle="What each channel maps to under the hood." />
          <div className="px-5 py-4 space-y-3">
            {Object.values(TEMPLATES).map((t) => (
              <div key={t.kind} className="text-xs">
                <div className="text-sm font-medium text-fg flex items-center gap-2"><Sparkles size={12} className="text-accent" />{t.label}</div>
                <div className="text-muted mt-0.5 leading-relaxed">{t.description}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-faint">{t.targetLength}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
