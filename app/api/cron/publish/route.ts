/**
 * GET /api/cron/publish — every 5 minutes via Vercel cron.
 *
 * Pulls due content_targets and fans them out to each channel's publisher.
 * Idempotent: the per-target status flip acts as a soft lock so two
 * concurrent crons don't double-post.
 */
import { type NextRequest } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { publishDueTargets } from '@/lib/publishers/dispatch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const result = await publishDueTargets();
  return Response.json({ ok: true, ...result });
}

export const POST = GET;
