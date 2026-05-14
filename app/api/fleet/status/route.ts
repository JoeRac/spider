/**
 * GET /api/fleet/status — canonical fleet-status endpoint.
 *
 * Spider has no integration outbox; outbound to Badger is direct
 * (`fetchBadgerWonClients`) and read-only, so we don't track per-target
 * outbound stats in DB. Inbound is captured by lib/integration-auth.ts
 * writing to audit_log on every probe.
 *
 * Auth: standard integration-auth (Bearer SPIDER_API_KEY + timestamp +
 * x-integration-app). The caller is normally 'silverback'.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireIntegrationAuth } from '@/lib/integration-auth';
import { readOrMintTraceId, TRACE_HEADER } from '@/lib/trace';

const APP_NAME = 'spider';
const KNOWN_SIBLINGS = ['badger', 'raven', 'meerkat', 'phoenix', 'ibex', 'silverback'] as const;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type DbStatus = { ok: boolean; latencyMs?: number; error?: string };
type Sibling = {
  name: string;
  lastOutboundOkAt: string | null;
  lastOutboundErrAt: string | null;
  lastOutboundErrMessage: string | null;
  lastInboundOkAt: string | null;
  lastInboundErrAt: string | null;
};

export async function GET(req: NextRequest) {
  const traceId = readOrMintTraceId(req);
  const auth = await requireIntegrationAuth(req);
  if (auth instanceof NextResponse) return auth;

  const generatedAt = new Date().toISOString();

  const dbStatus = await probeDb();
  const siblings = dbStatus.ok ? await siblingActivity() : [];

  const status: 'ok' | 'degraded' | 'down' = dbStatus.ok ? 'ok' : 'down';

  return NextResponse.json({
    app: APP_NAME,
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
    deployedAt: process.env.VERCEL_DEPLOYMENT_CREATED_AT ?? null,
    region: process.env.VERCEL_REGION ?? null,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
    status,
    db: dbStatus,
    // Spider has no outbox — outbound is direct, in-process Badger reads.
    outbox: null,
    siblings,
    trace: { supportsTraceId: true, traceId },
    generatedAt,
  }, {
    headers: { [TRACE_HEADER]: traceId },
  });
}

async function probeDb(): Promise<DbStatus> {
  try {
    const t0 = Date.now();
    await db.execute(sql`select 1`);
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function siblingActivity(): Promise<Sibling[]> {
  const siblingList = sql.join(
    KNOWN_SIBLINGS.map((s) => sql`${s}`),
    sql`, `,
  );

  // Inbound: audit_log integration.request.* events grouped by caller (actor).
  const inRows = await db.execute<{
    actor: string;
    last_ok: Date | null;
    last_err: Date | null;
  }>(sql`
    select
      actor,
      max(created_at) filter (where event = 'integration.request.ok')     as last_ok,
      max(created_at) filter (where event = 'integration.request.denied') as last_err
    from audit_log
    where actor in (${siblingList})
    group by actor
  `);
  const inBy = new Map<string, { ok: Date | null; err: Date | null }>();
  const rowsIn = (inRows as unknown as { rows?: Array<Record<string, unknown>> }).rows
             ?? (inRows as unknown as Array<Record<string, unknown>>);
  for (const r of rowsIn ?? []) {
    inBy.set(String(r.actor), {
      ok: r.last_ok ? new Date(r.last_ok as string | Date) : null,
      err: r.last_err ? new Date(r.last_err as string | Date) : null,
    });
  }

  return KNOWN_SIBLINGS.map((name): Sibling => {
    const inb = inBy.get(name);
    return {
      name,
      // Spider doesn't track outbound timestamps yet — leave null. The
      // sibling's /api/fleet/status reports its own last-inbound-from-spider
      // which is the cross-check.
      lastOutboundOkAt: null,
      lastOutboundErrAt: null,
      lastOutboundErrMessage: null,
      lastInboundOkAt: inb?.ok?.toISOString() ?? null,
      lastInboundErrAt: inb?.err?.toISOString() ?? null,
    };
  });
}
