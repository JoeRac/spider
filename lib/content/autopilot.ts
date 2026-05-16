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
