/**
 * GET /api/health — liveness probe. Returns the build sha + DB reachability.
 */
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  let dbOk = false;
  try {
    await db.execute(sql`select 1`);
    dbOk = true;
  } catch { /* falls through */ }
  return Response.json({ ok: dbOk, ts: Date.now() });
}
