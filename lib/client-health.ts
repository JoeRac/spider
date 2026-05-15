/**
 * Client health score — a single 0–100 number summarising how well
 * Spider is serving a given client. Weighted blend of four axes:
 *
 *   - **channels**  (30%) — how many connected channels relative to a
 *                            healthy threshold (4 connected = 100%).
 *   - **velocity**  (25%) — successful publishes in the last 30 days
 *                            relative to a target (15 = 100%).
 *   - **seo**       (25%) — latest on-page audit score (0–100 already).
 *                            Null audits read as 50 so a missing audit
 *                            doesn't tank the number.
 *   - **autopilot** (20%) — mode signal: full=100, review=75, paused=20.
 *
 * Status overrides:
 *   - `archived`  → 0.
 *   - `onboarding`→ heavily penalised (multiplied by 0.4) so an onboarding
 *                    client never reads "healthy" by accident.
 *
 * The score is meant to be load-bearing for the operator's morning scan
 * ("Phoenix 87, Bayside 23") and the seed for a future client-facing
 * monthly report. Tune the weights in one place — `WEIGHTS` below.
 */
import type { AutopilotMode } from '@/lib/content/autopilot';

const WEIGHTS = {
  channels: 0.30,
  velocity: 0.25,
  seo: 0.25,
  autopilot: 0.20,
} as const;

const CHANNEL_TARGET = 4;
const VELOCITY_TARGET = 15; // posts in 30d for a healthy active client

const AUTOPILOT_SCORE: Record<AutopilotMode, number> = {
  full: 100,
  review: 75,
  paused: 20,
};

export type HealthFactors = {
  channels: number;
  velocity: number;
  seo: number;
  autopilot: number;
};

export type ClientHealth = {
  score: number;
  factors: HealthFactors;
  label: 'healthy' | 'attention' | 'critical' | 'archived';
};

export function computeClientHealth(input: {
  status: string;
  autopilotMode: AutopilotMode;
  connectedChannels: number;
  publishedLast30d: number;
  seoScore: number | null;
}): ClientHealth {
  if (input.status === 'archived') {
    return { score: 0, label: 'archived', factors: { channels: 0, velocity: 0, seo: 0, autopilot: 0 } };
  }

  const channels = clamp(round((input.connectedChannels / CHANNEL_TARGET) * 100), 0, 100);
  const velocity = clamp(round((input.publishedLast30d / VELOCITY_TARGET) * 100), 0, 100);
  const seo = input.seoScore != null ? clamp(input.seoScore, 0, 100) : 50;
  const autopilot = AUTOPILOT_SCORE[input.autopilotMode] ?? 50;

  let score =
    channels  * WEIGHTS.channels  +
    velocity  * WEIGHTS.velocity  +
    seo       * WEIGHTS.seo       +
    autopilot * WEIGHTS.autopilot;

  // Penalise non-active clients so a paused / onboarding client doesn't
  // accidentally read 'healthy'. Paused already reads via autopilot=20,
  // but onboarding pre-empts everything because there's no real signal
  // yet.
  if (input.status === 'onboarding') score *= 0.4;
  if (input.status === 'paused') score = Math.min(score, 35);

  const final = Math.round(score);
  return {
    score: final,
    factors: { channels, velocity, seo, autopilot },
    label:
      final >= 75 ? 'healthy' :
      final >= 50 ? 'attention' :
      'critical',
  };
}

export function healthTone(label: ClientHealth['label']): 'ok' | 'info' | 'warn' | 'err' | 'neutral' {
  if (label === 'healthy')   return 'ok';
  if (label === 'attention') return 'warn';
  if (label === 'critical')  return 'err';
  return 'neutral';
}

function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }
function round(n: number): number { return Math.round(n); }
