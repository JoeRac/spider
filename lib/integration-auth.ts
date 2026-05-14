/**
 * Sibling-app integration auth — matches the pattern shipped across the
 * fleet (raven, badger, meerkat, phoenix).
 *
 * Spider previously had no inbound auth on its API. This module adds it
 * specifically for the fleet-status surface so Silverback (and future
 * fleet probes) can talk to Spider without exposing it to the public.
 *
 * Auth scheme:
 *   - `Authorization: Bearer ${SPIDER_API_KEY}` — long static token,
 *     timing-safe compared.
 *   - Optional `X-Integration-Timestamp` (epoch millis, ±5 min skew).
 *   - `X-Integration-App: <caller>` — identifies the sibling.
 *   - `X-Trace-Id: tr_<hex>` — propagated through audit + outbound.
 *
 * Every call (success or rejection) appends to `audit_log` with
 * `event = integration.request.ok|denied`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { db } from './db';
import { auditLog } from './db/schema';
import { readOrMintTraceId } from './trace';

const MAX_SKEW_MS = 5 * 60 * 1000;

const KNOWN_CALLERS = ['badger', 'raven', 'meerkat', 'phoenix', 'silverback', 'ibex'] as const;
type KnownCaller = (typeof KNOWN_CALLERS)[number];

export type IntegrationCaller = {
  app: KnownCaller | 'unknown';
  traceId: string;
};

export async function requireIntegrationAuth(
  req: NextRequest,
): Promise<NextResponse | IntegrationCaller> {
  const traceId = readOrMintTraceId(req);
  const expected = process.env.SPIDER_API_KEY;
  if (!expected) {
    return NextResponse.json(
      { error: 'Integration API not configured on this server' },
      { status: 500 },
    );
  }

  const auth = req.headers.get('authorization') ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    await audit(req, traceId, false, 'missing bearer');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supplied = Buffer.from(m[1]!);
  const reference = Buffer.from(expected);
  if (supplied.length !== reference.length || !timingSafeEqual(supplied, reference)) {
    await audit(req, traceId, false, 'bearer mismatch');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tsHeader = req.headers.get('x-integration-timestamp');
  if (tsHeader) {
    const ts = Number(tsHeader);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
      await audit(req, traceId, false, 'timestamp skew');
      return NextResponse.json({ error: 'Request timestamp out of window' }, { status: 401 });
    }
  }

  const callerHeader = req.headers.get('x-integration-app') ?? 'unknown';
  const caller: IntegrationCaller['app'] =
    (KNOWN_CALLERS as readonly string[]).includes(callerHeader)
      ? (callerHeader as KnownCaller)
      : 'unknown';
  await audit(req, traceId, true, `caller=${caller}`);
  return { app: caller, traceId };
}

async function audit(req: NextRequest, traceId: string, ok: boolean, note: string): Promise<void> {
  try {
    const url = new URL(req.url);
    await db.insert(auditLog).values({
      event: ok ? 'integration.request.ok' : 'integration.request.denied',
      actor: req.headers.get('x-integration-app') ?? 'unknown',
      targetType: 'integration',
      targetId: req.headers.get('x-integration-app') ?? 'unknown',
      traceId,
      payload: {
        path: url.pathname,
        method: req.method,
        note,
        ip: req.headers.get('x-forwarded-for') ?? null,
      },
    });
  } catch {
    /* Auditing must never break the request. */
  }
}
