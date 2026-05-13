/**
 * Vercel cron auth — every cron handler should call `requireCron(req)`
 * at the top. The cron secret comes from `CRON_SECRET` and is passed
 * back as `Authorization: Bearer ${CRON_SECRET}` by the Vercel scheduler.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { config } from '@/lib/config';

export function requireCron(req: NextRequest): NextResponse | null {
  if (!config.cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const a = Buffer.from(m[1]!);
  const b = Buffer.from(config.cronSecret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
