/**
 * One autopilot tick for a single client.
 *
 * Single source of truth shared by:
 *   - the daily cron (`/api/cron/generate-daily`) which iterates every
 *     client, and
 *   - the manual "Run now" route (`/api/clients/[id]/autopilot/run`)
 *     which fires the same logic on demand for one client.
 *
 * Gate sequence (matches the AutopilotPreviewStrip resolver):
 *   1. Load the client; if missing → not-found.
 *   2. shouldGenerate(status, policy.mode) — skip if archived/paused/etc.
 *   3. Daily safety net — if anything was created in the last 18h, skip
 *      (defends against double-fired crons + this manual route).
 *   4. Compute live integrations + this-week's published counts per channel.
 *   5. pickChannelForGeneration — null → skip (cadence met or no targets).
 *   6. Map channel → content kind via the template catalog.
 *   7. runGeneration → returns the run row + drafted item ids.
 *
 * Returns a discriminated `TickResult` so callers (cron, route, future
 * UI) render identical outcomes.
 */
import { db } from '@/lib/db';
import { clients, contentItems, contentTargets, integrations, type Channel } from '@/lib/db/schema';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { runGeneration } from '@/lib/content/generate';
import { autopilotFromClientSettings, shouldGenerate, pickChannelForGeneration } from '@/lib/content/autopilot';
import { TEMPLATES, type ContentKind } from '@/lib/content/templates';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;
const DAILY_QUOTA_WINDOW_MS = 18 * 60 * 60 * 1000;

export type TickResult =
  | { clientId: string; status: 'not-found' }
  | { clientId: string; status: 'skipped'; reason: string; items?: number }
  | { clientId: string; status: 'completed'; runId: string; channel: Channel; items: number }
  | { clientId: string; status: 'failed'; reason: string };

export async function runAutopilotTickForClient(clientId: string): Promise<TickResult> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return { clientId, status: 'not-found' };

  const policy = autopilotFromClientSettings(client.settings);
  if (!shouldGenerate(client.status, policy)) {
    return {
      clientId,
      status: 'skipped',
      reason: client.status !== 'active' ? `client:${client.status}` : `autopilot:${policy.mode}`,
    };
  }

  const settings = (client.settings as Record<string, unknown>) ?? {};
  const fallbackQuota = Number((settings.dailyQuota as number | undefined) ?? 1);
  const sinceDay = new Date(Date.now() - DAILY_QUOTA_WINDOW_MS);
  const sinceWeek = new Date(Date.now() - ONE_WEEK_MS);

  // Daily safety net regardless of cadence — prevents a runaway loop
  // generating multiple times per day if either the cron is double-
  // fired OR the operator hits "Run now" on a client that already had
  // a tick today.
  const [recent] = await db.select({ n: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(and(eq(contentItems.clientId, clientId), gte(contentItems.createdAt, sinceDay)));
  if ((recent?.n ?? 0) >= fallbackQuota) {
    return { clientId, status: 'skipped', reason: 'quota-met', items: recent?.n };
  }

  // Live channels + this-week's publish counts so the autopilot can
  // pick the most-overdue one.
  const liveIntegrations = await db.select({ channel: integrations.channel, id: integrations.id })
    .from(integrations)
    .where(and(eq(integrations.clientId, clientId), eq(integrations.status, 'connected')));
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
        eq(contentTargets.status, 'published'),
        gte(contentTargets.publishedAt, sinceWeek),
      ))
      .groupBy(integrations.channel)
    : [];
  const weekCounts: Record<string, number> = {};
  for (const w of weekCountsRaw) weekCounts[w.channel] = w.n;

  const usingDefaultCadence = Object.keys(policy.cadence).length === 0;
  const pickedChannel = pickChannelForGeneration(liveChannels, policy.cadence, weekCounts);
  if (!pickedChannel) {
    return {
      clientId,
      status: 'skipped',
      reason: liveChannels.length === 0
        ? 'no-live-channels'
        : usingDefaultCadence
          ? 'default-cadence-met'
          : 'cadence-met',
    };
  }

  const kind = pickKindForChannel(pickedChannel);

  try {
    const outcome = await runGeneration({
      clientId,
      kind,
      quantity: 1,
    });
    if (outcome.status === 'failed') {
      return { clientId, status: 'failed', reason: outcome.error ?? 'generation failed' };
    }
    return {
      clientId,
      status: 'completed',
      runId: outcome.runId,
      channel: pickedChannel,
      items: outcome.itemIds.length,
    };
  } catch (e) {
    return { clientId, status: 'failed', reason: e instanceof Error ? e.message : 'unknown' };
  }
}

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
