/**
 * GET /api/cron/refresh-metrics — hourly via Vercel cron.
 * Pulls the latest channel + per-post metrics for every connected
 * integration. Append-only snapshots so we can render history charts.
 */
import { type NextRequest } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { refreshAllMetrics } from '@/lib/metrics/refresh';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const summary = await refreshAllMetrics();
  return Response.json({ ok: true, ...summary });
}

export const POST = GET;
