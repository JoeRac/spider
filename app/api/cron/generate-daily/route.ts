/**
 * GET /api/cron/generate-daily — once a day via Vercel cron.
 *
 * For every active client whose voice profile is filled in, generates a
 * default daily batch (one local-post). Drafts land in the library;
 * scheduling stays manual so the operator approves before fan-out.
 *
 * Skips clients whose daily quota is already satisfied today (we keep
 * the budget knob in `clients.settings.dailyQuota`, default 1).
 */
import { type NextRequest } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { db } from '@/lib/db';
import { clients, contentItems } from '@/lib/db/schema';
import { and, eq, gte, sql } from 'drizzle-orm';
import { runGeneration } from '@/lib/content/generate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const since = new Date(Date.now() - 18 * 60 * 60 * 1000);
  const activeClients = await db
    .select()
    .from(clients)
    .where(and(eq(clients.status, 'active')));

  const summary: Array<{ clientId: string; runId?: string; status: string; reason?: string; items?: number }> = [];
  for (const client of activeClients) {
    const settings = (client.settings as Record<string, unknown>) ?? {};
    const quota = Number((settings.dailyQuota as number | undefined) ?? 1);
    if (quota <= 0) {
      summary.push({ clientId: client.id, status: 'skipped', reason: 'quota=0' });
      continue;
    }
    const [recent] = await db.select({ n: sql<number>`count(*)::int` })
      .from(contentItems)
      .where(and(eq(contentItems.clientId, client.id), gte(contentItems.createdAt, since)));
    if ((recent?.n ?? 0) >= quota) {
      summary.push({ clientId: client.id, status: 'skipped', reason: 'quota-met', items: recent?.n });
      continue;
    }
    try {
      const outcome = await runGeneration({ clientId: client.id, kind: 'post', quantity: 1 });
      summary.push({ clientId: client.id, status: outcome.status, runId: outcome.runId, items: outcome.itemIds.length });
    } catch (e) {
      summary.push({ clientId: client.id, status: 'failed', reason: e instanceof Error ? e.message : 'unknown' });
    }
  }

  return Response.json({ ok: true, processed: activeClients.length, summary });
}

export const POST = GET;
