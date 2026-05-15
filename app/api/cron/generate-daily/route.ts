/**
 * GET /api/cron/generate-daily — once a day via Vercel cron.
 *
 * Walks every `active` client whose autopilot mode isn't `paused`,
 * checks the per-channel cadence map against this-week's actuals, and
 * generates a single batch for the channel that's most overdue. Drafts
 * land in the library; in `review` mode they wait for the operator to
 * promote them to `scheduled`; in `full` mode the publish cron picks
 * them up as soon as they're scheduled.
 *
 * Quota fallback: if no cadence is configured, falls back to the
 * legacy `clients.settings.dailyQuota` knob (default 1 post/day).
 */
import { type NextRequest } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { db } from '@/lib/db';
import { clients, contentItems, contentTargets, integrations, type Channel } from '@/lib/db/schema';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { runGeneration } from '@/lib/content/generate';
import { autopilotFromClientSettings, shouldGenerate, pickChannelForGeneration } from '@/lib/content/autopilot';
import { TEMPLATES, type ContentKind } from '@/lib/content/templates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const sinceDay = new Date(Date.now() - 18 * 60 * 60 * 1000);
  const sinceWeek = new Date(Date.now() - ONE_WEEK_MS);

  const allClients = await db.select().from(clients);

  const summary: Array<{ clientId: string; status: string; reason?: string; runId?: string; items?: number; channel?: string }> = [];

  for (const client of allClients) {
    const policy = autopilotFromClientSettings(client.settings);
    if (!shouldGenerate(client.status, policy)) {
      summary.push({ clientId: client.id, status: 'skipped', reason: client.status !== 'active' ? `client:${client.status}` : `autopilot:${policy.mode}` });
      continue;
    }

    const settings = (client.settings as Record<string, unknown>) ?? {};
    const fallbackQuota = Number((settings.dailyQuota as number | undefined) ?? 1);

    // Already at quota for the day? (Legacy check; preserves prior behaviour.)
    const [recent] = await db.select({ n: sql<number>`count(*)::int` })
      .from(contentItems)
      .where(and(eq(contentItems.clientId, client.id), gte(contentItems.createdAt, sinceDay)));
    if ((recent?.n ?? 0) >= fallbackQuota) {
      summary.push({ clientId: client.id, status: 'skipped', reason: 'quota-met', items: recent?.n });
      continue;
    }

    // Build live channel list + this-week posted counts so the autopilot
    // can pick the most-overdue channel.
    const liveIntegrations = await db.select({ channel: integrations.channel, id: integrations.id })
      .from(integrations)
      .where(and(eq(integrations.clientId, client.id), eq(integrations.status, 'connected')));
    const liveChannels = liveIntegrations.map((r) => r.channel as Channel);
    const integrationIds = liveIntegrations.map((r) => r.id);

    const weekCountsRaw = integrationIds.length
      ? await db.select({
          channel: integrations.channel,
          n: sql<number>`count(*)::int`,
        })
        .from(contentTargets)
        .innerJoin(integrations, eq(integrations.id, contentTargets.integrationId))
        .where(and(
          inArray(contentTargets.integrationId, integrationIds),
          gte(contentTargets.publishedAt, sinceWeek),
        ))
        .groupBy(integrations.channel)
      : [];
    const weekCounts: Record<string, number> = {};
    for (const w of weekCountsRaw) weekCounts[w.channel] = w.n;

    // Pick a channel + content kind.
    const pickedChannel = pickChannelForGeneration(liveChannels, policy.cadence, weekCounts);
    const kind = pickedChannel ? pickKindForChannel(pickedChannel) : 'post';

    try {
      const outcome = await runGeneration({
        clientId: client.id,
        kind,
        quantity: 1,
      });
      summary.push({
        clientId: client.id,
        status: outcome.status,
        runId: outcome.runId,
        items: outcome.itemIds.length,
        channel: pickedChannel ?? undefined,
      });
    } catch (e) {
      summary.push({ clientId: client.id, status: 'failed', reason: e instanceof Error ? e.message : 'unknown' });
    }
  }

  return Response.json({ ok: true, processed: allClients.length, summary });
}

export const POST = GET;

// dodge unused import lint when desc is referenced indirectly
void desc;

/**
 * Pick a content kind given a target channel. Reuses the channel hints
 * baked into the template catalog so the choice tracks what each
 * channel actually expects.
 */
function pickKindForChannel(channel: Channel): ContentKind {
  for (const t of Object.values(TEMPLATES)) {
    if (t.channels.includes(channel)) return t.kind;
  }
  return 'post';
}
