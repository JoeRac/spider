/**
 * POST /api/clients/import-badger
 *
 * Pulls every WON lead from Badger and upserts a `clients` row per
 * lead id. Idempotent — running it twice is a no-op for clients that
 * already exist (we update the snapshot fields but leave status,
 * description, settings, tags alone).
 *
 * Response shape:
 *   { data: { imported, updated, total } }
 */
import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { clients, auditLog } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { ok, err } from '@/lib/api-helpers';
import { fetchBadgerWonClients } from '@/lib/badger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  let wonClients;
  try {
    wonClients = await fetchBadgerWonClients();
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return err(502, `Failed to fetch from Badger: ${message}`);
  }

  if (!wonClients.length) {
    return ok({ imported: 0, updated: 0, total: 0, note: 'No won clients found in Badger.' });
  }

  // Fan-out: load existing rows by lead_id in one shot so we can
  // diff insert vs update without N round-trips.
  const ids = wonClients.map((c) => c.leadId);
  const existing = await db
    .select({ id: clients.id, leadId: clients.leadId })
    .from(clients)
    .where(inArray(clients.leadId, ids));
  const existingByLeadId = new Map(existing.map((r) => [r.leadId, r.id]));

  let imported = 0;
  let updated = 0;

  for (const c of wonClients) {
    const existingId = existingByLeadId.get(c.leadId);
    if (existingId) {
      // Refresh snapshot fields only — don't trample operator edits to
      // status/description/settings.
      await db.update(clients).set({
        name: c.name,
        website: c.website,
        phone: c.phone,
        email: c.email,
        addressStreet: c.addressStreet,
        addressCity: c.addressCity,
        addressState: c.addressState,
        addressPostcode: c.addressPostcode,
        addressCountry: c.addressCountry,
        updatedAt: new Date(),
      }).where(eq(clients.id, existingId));
      updated += 1;
    } else {
      const [row] = await db.insert(clients).values({
        leadId: c.leadId,
        badgerCompanyId: c.leadId,
        name: c.name,
        website: c.website,
        phone: c.phone,
        email: c.email,
        addressStreet: c.addressStreet,
        addressCity: c.addressCity,
        addressState: c.addressState,
        addressPostcode: c.addressPostcode,
        addressCountry: c.addressCountry,
      }).returning({ id: clients.id });
      imported += 1;
      if (row) {
        await db.insert(auditLog).values({
          event: 'client.imported',
          actor: 'operator',
          targetType: 'client',
          targetId: row.id,
          payload: {
            leadId: c.leadId,
            dealValue: c.dealValue,
          },
        });
      }
    }
  }

  return ok({ imported, updated, total: wonClients.length });
}
