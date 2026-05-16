/**
 * Drains the silverback_outbox.
 *
 * Mirrors Badger/Raven/Meerkat/Ibex's drainer. Claims pending rows
 * with FOR UPDATE SKIP LOCKED, POSTs to Silverback /api/events,
 * retries with exponential backoff, abandons after 9 attempts.
 * Silverback dedupes on (source_app, idempotency_key) end-to-end.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { sql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { silverbackOutbox, type SilverbackOutboxRow } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 9;
const BACKOFF_SECONDS = [30, 120, 600, 1800, 3600, 10_800, 21_600, 43_200] as const;
const HTTP_TIMEOUT_MS = 8_000;

function authorizeCron(req: NextRequest): boolean {
  const required = process.env.CRON_SECRET;
  if (!required) return true;
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${required}` || req.headers.get('x-cron-secret') === required;
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
  }
  const baseUrl = process.env.SILVERBACK_BASE_URL;
  const apiKey = process.env.SILVERBACK_API_KEY;
  if (!baseUrl || !apiKey) {
    return NextResponse.json({ data: { skipped: 'silverback not configured' } });
  }

  const now = new Date();
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx.execute<SilverbackOutboxRow>(sql`
      with chosen as (
        select id from silverback_outbox
         where status = 'pending' and next_attempt_at <= ${now.toISOString()}
         order by next_attempt_at asc
         limit ${BATCH_SIZE}
         for update skip locked
      )
      update silverback_outbox
         set status = 'sending', updated_at = now()
       where id in (select id from chosen)
       returning *
    `);
    return (rows as unknown as { rows?: SilverbackOutboxRow[] }).rows
      ?? (rows as unknown as SilverbackOutboxRow[])
      ?? [];
  });

  let succeeded = 0, failed = 0, abandoned = 0;
  await Promise.all(
    claimed.map(async (row) => {
      const attempt = row.attemptCount + 1;
      try {
        const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/events`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
            'x-integration-app': 'spider',
            'x-integration-timestamp': String(Date.now()),
          },
          body: JSON.stringify(row.event),
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        });
        if (res.ok) { await mark(row.id, attempt, 'succeeded', null); succeeded++; return; }
        const text = await res.text().catch(() => '');
        const err = `HTTP ${res.status}: ${text.slice(0, 200)}`;
        if (attempt >= MAX_ATTEMPTS) { await mark(row.id, attempt, 'abandoned', err); abandoned++; }
        else { await reschedule(row.id, attempt, err); failed++; }
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        if (attempt >= MAX_ATTEMPTS) { await mark(row.id, attempt, 'abandoned', err); abandoned++; }
        else { await reschedule(row.id, attempt, err); failed++; }
      }
    }),
  );

  return NextResponse.json({ data: { claimed: claimed.length, succeeded, failed, abandoned } });
}

async function mark(id: string, attempt: number, status: 'succeeded' | 'abandoned', err: string | null): Promise<void> {
  await db.update(silverbackOutbox).set({
    status, attemptCount: attempt, lastAttemptAt: new Date(), lastError: err, updatedAt: new Date(),
  }).where(eq(silverbackOutbox.id, id));
}
async function reschedule(id: string, attempt: number, err: string): Promise<void> {
  const idx = Math.min(attempt - 1, BACKOFF_SECONDS.length - 1);
  await db.update(silverbackOutbox).set({
    status: 'pending', attemptCount: attempt, lastAttemptAt: new Date(),
    lastError: err, nextAttemptAt: new Date(Date.now() + BACKOFF_SECONDS[idx]! * 1000), updatedAt: new Date(),
  }).where(eq(silverbackOutbox.id, id));
}
