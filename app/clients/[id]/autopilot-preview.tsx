/**
 * Next-tick preview strip — server-rendered, sits above the
 * AutopilotCard on the Overview tab.
 *
 * Tells the operator exactly what the daily cron would do for this
 * client if it fired right now, using the same resolver
 * (`previewNextAutopilotTick`) the cron actually uses. No background
 * computation, no estimation — one read of the same primitives.
 *
 * Why a small separate strip instead of folding into AutopilotCard:
 *   - the card is for *editing* policy; this strip is for *previewing*
 *     behavior. Different jobs, different visual weight.
 *   - the strip stays one line so it never crowds the Overview tab.
 */
import { Card, Badge, Dot } from '@/components/ui';
import { Zap, ZapOff, AlertTriangle, CheckCircle2, Sparkles, Plug } from 'lucide-react';
import { db } from '@/lib/db';
import { contentTargets, integrations, type Channel } from '@/lib/db/schema';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { listAdapters } from '@/lib/channels/registry';
import {
  previewNextAutopilotTick,
  type AutopilotPolicy,
  type AutopilotPreview,
} from '@/lib/content/autopilot';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function AutopilotPreviewStrip({
  clientId,
  clientStatus,
  policy,
  integrationRows,
}: {
  clientId: string;
  clientStatus: string;
  policy: AutopilotPolicy;
  integrationRows: Array<{ id: string; channel: string; status: string }>;
}) {
  const sinceWeek = new Date(Date.now() - ONE_WEEK_MS);

  const liveIntegrations = integrationRows.filter((i) => i.status === 'connected');
  const liveChannels = liveIntegrations.map((i) => i.channel as Channel);
  const integrationIds = liveIntegrations.map((i) => i.id);

  // This-week's published count per channel — same query shape the cron
  // uses. Empty array means no channels live -> the preview short-
  // circuits and we skip the DB call.
  let weekCounts: Record<string, number> = {};
  if (integrationIds.length > 0) {
    const rows = await db
      .select({
        channel: integrations.channel,
        n: sql<number>`count(*)::int`,
      })
      .from(contentTargets)
      .innerJoin(integrations, eq(integrations.id, contentTargets.integrationId))
      .where(and(
        inArray(contentTargets.integrationId, integrationIds),
        eq(contentTargets.status, 'published'),
        gte(contentTargets.publishedAt, sinceWeek),
      ))
      .groupBy(integrations.channel);
    for (const r of rows) weekCounts[r.channel] = r.n;
  }

  const preview = previewNextAutopilotTick({
    clientStatus,
    policy,
    liveChannels,
    thisWeekCounts: weekCounts,
  });

  return <PreviewRow preview={preview} clientId={clientId} />;
}

function PreviewRow({ preview, clientId }: { preview: AutopilotPreview; clientId: string }) {
  void clientId;
  const adapters = listAdapters();
  const labelByChannel = new Map(adapters.map((a) => [a.channel, a.label]));

  let tone: 'ok' | 'warn' | 'info' | 'neutral' | 'accent';
  let icon: React.ReactNode;
  let title: string;
  let detail: string;
  let pill: { label: string; tone: 'ok' | 'warn' | 'info' | 'neutral' | 'accent' } | null = null;

  if (preview.kind === 'paused') {
    tone = preview.reason === 'client-onboarding' ? 'info' : 'warn';
    icon = <ZapOff size={14} className={tone === 'info' ? 'text-info' : 'text-warn'} />;
    title = preview.reason === 'client-archived'    ? 'Autopilot off — client archived'
          : preview.reason === 'client-paused'      ? 'Autopilot off — client paused'
          : preview.reason === 'client-onboarding'  ? 'Autopilot off — client still in onboarding'
          : 'Autopilot paused — won\'t generate or publish';
    detail = preview.reason === 'autopilot-paused'
      ? 'Unpause in the Autopilot card below to resume.'
      : preview.reason === 'client-onboarding'
        ? 'Activate the client to let Spider start posting.'
        : 'Flip status back to active to resume.';
  } else if (preview.kind === 'no-channels') {
    tone = 'warn';
    icon = <Plug size={14} className="text-warn" />;
    title = 'Nothing scheduled — no channels connected';
    detail = 'Open the Channels tab to wire up at least one publishing surface.';
  } else if (preview.kind === 'cadence-met') {
    tone = 'ok';
    icon = <CheckCircle2 size={14} className="text-ok" />;
    title = preview.weeklyTotal === 0
      ? 'Cadence is zero — Spider is resting'
      : 'Cadence satisfied — Spider is resting for the rest of the week';
    detail = preview.weeklyTotal === 0
      ? 'Set a positive number in the Autopilot card below to start scheduling.'
      : `Target met (${preview.weeklyTotal}/week). Loop will fire again Monday.`;
    if (preview.weeklyTotal > 0 && preview.usingDefault) {
      pill = { label: 'default cadence', tone: 'accent' };
    }
  } else {
    // will-fire
    tone = 'accent';
    icon = <Zap size={14} className="text-accent" />;
    const channelLabel = labelByChannel.get(preview.channel) ?? preview.channel;
    title = `Next tick → ${channelLabel}`;
    detail = `The daily generation cron will pick ${channelLabel} as the most-overdue channel and draft a piece. ${preview.weeklyTotal}/week target.`;
    if (preview.usingDefault) {
      pill = { label: 'default cadence', tone: 'accent' };
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-3 flex items-center gap-3">
        <span className="flex-none">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-fg truncate">{title}</span>
            {pill && (
              <Badge tone={pill.tone}>
                <Sparkles size={9} />
                {pill.label}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted leading-snug">{detail}</div>
        </div>
        <Dot tone={tone} />
        {tone === 'warn' && <AlertTriangle size={12} className="text-warn flex-none" />}
      </div>
    </Card>
  );
}
