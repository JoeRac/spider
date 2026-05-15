/**
 * Generate view — the bulk-generation console. Imports the existing
 * GenerationConsole client component; renders alongside template hints.
 */
import { Card, CardHeader, Badge, Dot, SectionLabel } from '@/components/ui';
import { Sparkles } from 'lucide-react';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { asc, eq } from 'drizzle-orm';
import { GenerationConsole } from './generation-console';
import { config } from '@/lib/config';
import { TEMPLATES } from '@/lib/content/templates';

export async function GenerateView() {
  const clientList = await db.select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.status, 'active'))
    .orderBy(asc(clients.name));

  // If no active clients, still surface every client so the operator can
  // generate for a client they haven't activated yet.
  const fallback = clientList.length === 0
    ? await db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name))
    : clientList;

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
          <GenerationConsole clients={fallback} disabled={!zaiReady} defaultModel={config.zaiModel} />
        </div>
        <Card>
          <CardHeader title="Templates" subtitle="What each content kind is tuned for." />
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
