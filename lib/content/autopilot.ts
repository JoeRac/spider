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
import type { Channel } from '@/lib/db/schema';

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

// `updateAutopilot` (the only DB-touching function in this module) moved
// to `./autopilot-store.ts` so this file stays client-safe — the
// AutopilotCard imports value helpers from here and we don't want the
// bundler to drag the postgres driver into the client bundle.

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
 * Sensible default cadence for a client whose operator hasn't explicitly
 * configured one. Encodes the agency stance of "2–3 pieces per week,
 * spread across whatever channels are live." Channels with stronger
 * SEO returns get a 1; everything else stays at 0 to keep the volume
 * modest.
 *
 * The first time the cron picks a channel for a default-cadence client,
 * it'll lean on this map. Operators can override per-channel anytime
 * via the AutopilotCard on the client overview.
 */
const DEFAULT_CADENCE: Partial<Record<Channel, number>> = {
  google_my_business: 1,
  website_blog:       1,
  facebook:           1,
};

/**
 * Pick the channel that's most overdue per the cadence map. Returns
 * `null` when no live channel is below its weekly target — the cron
 * skips generation that day.
 *
 * If the per-client cadence map is *completely empty*, we fall back to
 * the agency default (DEFAULT_CADENCE) so a newly-activated client gets
 * a sane volume of content without the operator having to touch the
 * Autopilot card first. The default keeps total volume at ~2–3 pieces
 * per week, matching the spec.
 *
 * Once the operator sets any cadence entry (even a single channel at 1),
 * the default is bypassed entirely — explicit configuration always wins.
 */
export function pickChannelForGeneration(
  liveChannels: Channel[],
  cadence: Record<string, number>,
  thisWeek: Record<string, number>,
): Channel | null {
  const effective = Object.keys(cadence).length === 0
    ? defaultCadenceForChannels(liveChannels)
    : cadence;

  let bestChannel: Channel | null = null;
  let bestRatio = Infinity;
  for (const ch of liveChannels) {
    const target = effective[ch] ?? 0;
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

/**
 * Project DEFAULT_CADENCE onto only the channels this client has live,
 * so we don't promise output for a channel that doesn't exist.
 */
function defaultCadenceForChannels(liveChannels: Channel[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ch of liveChannels) {
    const target = DEFAULT_CADENCE[ch];
    if (target) out[ch] = target;
  }
  return out;
}

/**
 * Tells the UI whether a client's cadence is operator-configured or
 * falling back to the agency default. Used in the Autopilot card and
 * cron summaries so the operator can see "default cadence applied"
 * rather than wonder why posts are flowing without their input.
 */
export function isUsingDefaultCadence(cadence: Record<string, number>): boolean {
  return Object.keys(cadence).length === 0;
}

/**
 * Resolves what the cron will *actually* schedule against — the explicit
 * per-client cadence when set, otherwise the default agency cadence
 * projected onto live channels. Mirror of the resolution that lives
 * inside `pickChannelForGeneration` so the UI can render an honest
 * "Spider will post N/week" summary instead of inferring it.
 */
export function effectiveCadence(
  cadence: Record<string, number>,
  liveChannels: Channel[],
): Record<string, number> {
  if (Object.keys(cadence).length === 0) {
    return defaultCadenceForChannels(liveChannels);
  }
  // Custom cadence — return only entries for live channels and only
  // positive values; the cron skips zeros anyway, no need to surface them.
  const filtered: Record<string, number> = {};
  for (const ch of liveChannels) {
    const target = cadence[ch];
    if (typeof target === 'number' && target > 0) filtered[ch] = target;
  }
  return filtered;
}

/**
 * What would the daily cron do for this client right now? Pure function
 * that mirrors the cron's gates + resolver so the Overview tab can
 * render an honest "Next autopilot tick: ..." line without round-
 * tripping through the cron.
 *
 * Result is a discriminated union the UI renders directly:
 *   - { kind: 'paused', reason }      — client.status or autopilot.mode blocks
 *   - { kind: 'no-channels' }         — autopilot would run but no live channels
 *   - { kind: 'cadence-met', usingDefault } — every live channel is on or above target this week
 *   - { kind: 'will-fire', channel, isDefaultCadence } — the next tick will pick this channel
 *
 * The cron actually runs once a day, so the "when" is "next daily cron
 * fire" — we don't pre-compute the timestamp here because cron schedules
 * are configured externally.
 */
export type AutopilotPreview =
  | { kind: 'paused'; reason: 'client-archived' | 'client-paused' | 'client-onboarding' | 'autopilot-paused' }
  | { kind: 'no-channels' }
  | { kind: 'cadence-met'; usingDefault: boolean; weeklyTotal: number }
  | { kind: 'will-fire'; channel: Channel; usingDefault: boolean; weeklyTotal: number };

export function previewNextAutopilotTick(args: {
  clientStatus: string;
  policy: AutopilotPolicy;
  liveChannels: Channel[];
  thisWeekCounts: Record<string, number>;
}): AutopilotPreview {
  const { clientStatus, policy, liveChannels, thisWeekCounts } = args;
  if (clientStatus === 'archived') return { kind: 'paused', reason: 'client-archived' };
  if (clientStatus === 'paused')   return { kind: 'paused', reason: 'client-paused' };
  if (clientStatus !== 'active')   return { kind: 'paused', reason: 'client-onboarding' };
  if (policy.mode === 'paused')    return { kind: 'paused', reason: 'autopilot-paused' };

  if (liveChannels.length === 0)   return { kind: 'no-channels' };

  const effective = effectiveCadence(policy.cadence, liveChannels);
  const usingDefault = isUsingDefaultCadence(policy.cadence);
  const weeklyTotal = Object.values(effective).reduce((s, n) => s + (n ?? 0), 0);

  if (weeklyTotal === 0) {
    // Live channels exist but none has a positive target — operator
    // configured the autopilot to do nothing.
    return { kind: 'cadence-met', usingDefault, weeklyTotal: 0 };
  }

  const picked = pickChannelForGeneration(liveChannels, policy.cadence, thisWeekCounts);
  if (!picked) return { kind: 'cadence-met', usingDefault, weeklyTotal };
  return { kind: 'will-fire', channel: picked, usingDefault, weeklyTotal };
}
