/**
 * Per-client autopilot policy.
 *
 * Stored under `clients.settings.autopilot` so we don't need a schema
 * migration for what is essentially a tuneable knob. Three modes:
 *
 *   - 'full'    — cron generates daily and the publish dispatcher
 *                 ships items as soon as they're `scheduled`. Operator
 *                 is downstream of the work, not a gate.
 *   - 'review'  — cron generates daily; items land as drafts and stay
 *                 there until the operator promotes to `scheduled`.
 *                 This is the safe default after onboarding.
 *   - 'paused'  — neither generate nor publish for this client. Used
 *                 when the dealership asks for a break, the agency
 *                 hasn't billed in a while, etc.
 *
 * `cadence` is a per-channel posts-per-week target. The daily generation
 * cron uses it to decide which channel(s) get fresh content on a given
 * day. Channels not listed default to the global generation defaults.
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import { clients, type Channel } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export type AutopilotMode = 'full' | 'review' | 'paused';

export const autopilotSchema = z.object({
  mode: z.enum(['full', 'review', 'paused']).default('review'),
  cadence: z.record(z.string(), z.number().int().min(0).max(50)).default({}),
});

export type AutopilotPolicy = z.infer<typeof autopilotSchema>;

export const DEFAULT_POLICY: AutopilotPolicy = { mode: 'review', cadence: {} };

export function autopilotFromClientSettings(settings: unknown): AutopilotPolicy {
  if (!settings || typeof settings !== 'object') return DEFAULT_POLICY;
  const raw = (settings as Record<string, unknown>).autopilot;
  const parsed = autopilotSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_POLICY;
}

export async function updateAutopilot(clientId: string, policy: AutopilotPolicy): Promise<AutopilotPolicy> {
  const cleaned = autopilotSchema.parse(policy);
  const [row] = await db.select({ settings: clients.settings }).from(clients).where(eq(clients.id, clientId)).limit(1);
  const next = { ...(row?.settings ?? {}), autopilot: cleaned };
  await db.update(clients).set({ settings: next, updatedAt: new Date() }).where(eq(clients.id, clientId));
  return cleaned;
}

/**
 * Should the cron worker generate content for this client today?
 * Honors both the binary client.status (only 'active' generates) and
 * the autopilot mode ('paused' blocks even for active clients).
 */
export function shouldGenerate(clientStatus: string, policy: AutopilotPolicy): boolean {
  if (clientStatus !== 'active') return false;
  if (policy.mode === 'paused') return false;
  return true;
}

/**
 * Should the cron worker publish a scheduled item now?
 * Identical gate to shouldGenerate — `review` mode doesn't block publish
 * because the operator already moved the item to `scheduled`.
 */
export function shouldPublish(clientStatus: string, policy: AutopilotPolicy): boolean {
  if (clientStatus === 'archived') return false;
  if (clientStatus === 'paused') return false;
  if (policy.mode === 'paused') return false;
  return true;
}

/**
 * Pick the channel that's most overdue per the cadence map. Returns
 * `null` when no live channel is below its weekly target — the cron
 * skips generation that day.
 *
 * Phase-1 implementation is intentionally simple: each call picks the
 * channel whose actual-vs-target ratio is lowest. Cron passes a tally
 * of "posts this week per channel" so the function is pure.
 */
export function pickChannelForGeneration(
  liveChannels: Channel[],
  cadence: Record<string, number>,
  thisWeek: Record<string, number>,
): Channel | null {
  let bestChannel: Channel | null = null;
  let bestRatio = Infinity;
  for (const ch of liveChannels) {
    const target = cadence[ch] ?? 0;
    if (target <= 0) continue;
    const actual = thisWeek[ch] ?? 0;
    const ratio = actual / target;
    if (ratio < 1 && ratio < bestRatio) {
      bestChannel = ch;
      bestRatio = ratio;
    }
  }
  return bestChannel;
}
