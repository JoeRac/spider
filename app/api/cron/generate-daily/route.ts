/**
 * GET /api/cron/generate-daily — once a day via Vercel cron.
 *
 * Walks every client and delegates each one to
 * `runAutopilotTickForClient`, which contains the full gate sequence
 * (client.status, autopilot.mode, daily quota, cadence resolver, channel
 * pick, kind pick, generation). The same helper backs the manual
 * "Run now" endpoint so cron and on-demand can't drift.
 */
import { type NextRequest } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { runAutopilotTickForClient } from '@/lib/content/autopilot-run';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const allClients = await db.select({ id: clients.id }).from(clients);

  // Sequential to keep concurrent Z.AI traffic + DB write pressure bounded.
  // Per-client tick is ~1–2s (the LLM call dominates) so this comfortably
  // finishes inside maxDuration for an agency-sized list.
  const summary = [] as Array<Awaited<ReturnType<typeof runAutopilotTickForClient>>>;
  for (const { id } of allClients) {
    summary.push(await runAutopilotTickForClient(id));
  }

  return Response.json({ ok: true, processed: allClients.length, summary });
}

export const POST = GET;
