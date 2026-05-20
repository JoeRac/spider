/**
 * POST /api/integrations/lead-sync
 *
 * Receiver for Badger → Spider lead-fact replication. Spider mirrors
 * the source-of-truth lead record as `clients` (one row per won
 * dealership). Every Spider client is bound to a lead by schema design
 * (`lead_id` is NOT NULL), so this endpoint always has a mirror to
 * update when one exists.
 *
 * What gets synced: name, website, phone, email (always null in the
 * Badger source today — Spider keeps email locally-editable), and the
 * five address columns. The Badger source schema uses
 * `addressStreet1` / `addressStreet2`; we collapse to Spider's single
 * `addressStreet` by joining non-empty lines with ", ".
 *
 * Stale-check via `badgerLastSyncAt`. Auth: requireIntegrationAuth
 * (SPIDER_API_KEY bearer).
 *
 * Wire field: `leadId` (canonical, fleet-wide lead identifier).
 */

import { type NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { requireIntegrationAuth } from '@/lib/integration-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Payload = {
  leadId?: string;
  name: string;
  phone: string | null;
  website: string | null;
  addressStreet1: string | null;
  addressStreet2: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostcode: string | null;
  addressCountry: string | null;
  updatedAt: string;
  changedFields: string[];
};

export async function POST(req: NextRequest) {
  const auth = await requireIntegrationAuth(req);
  if (auth instanceof NextResponse) return auth;

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const leadId = body?.leadId;
  if (!leadId || typeof leadId !== 'string' || leadId.length === 0) {
    return NextResponse.json({ error: 'leadId required' }, { status: 400 });
  }
  if (!body.updatedAt || Number.isNaN(Date.parse(body.updatedAt))) {
    return NextResponse.json({ error: 'updatedAt must be an ISO timestamp' }, { status: 400 });
  }

  const rows = await db.select().from(clients).where(eq(clients.leadId, leadId));
  if (rows.length === 0) {
    return NextResponse.json({ accepted: true, matched: 0, reason: 'no Spider mirror' });
  }

  const incomingUpdatedAt = new Date(body.updatedAt);
  const addressStreet = [body.addressStreet1, body.addressStreet2]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join(', ') || null;

  let appliedCount = 0;
  let skippedStale = 0;
  for (const row of rows) {
    if (row.badgerLastSyncAt && row.badgerLastSyncAt >= incomingUpdatedAt) {
      skippedStale++;
      continue;
    }
    await db
      .update(clients)
      .set({
        name: body.name,
        phone: body.phone,
        website: body.website,
        addressStreet,
        addressCity: body.addressCity,
        addressState: body.addressState,
        addressPostcode: body.addressPostcode,
        addressCountry: body.addressCountry,
        badgerLastSyncAt: incomingUpdatedAt,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, row.id));
    appliedCount++;
  }

  return NextResponse.json({
    accepted: true,
    matched: rows.length,
    applied: appliedCount,
    skipped: skippedStale,
  });
}
