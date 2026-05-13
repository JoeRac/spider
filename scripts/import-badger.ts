/**
 * One-shot CLI to import Badger WON clients into Spider.
 * Useful for bootstrapping the DB; the same logic lives at
 * `POST /api/clients/import-badger` for in-app use.
 */
import 'dotenv/config';
import { db } from '../lib/db/index';
import { clients, auditLog } from '../lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { fetchBadgerWonClients } from '../lib/badger';

async function main() {
  const won = await fetchBadgerWonClients();
  console.log(`▸ ${won.length} won clients from Badger`);
  if (!won.length) return;

  const ids = won.map((c) => c.companyId);
  const existing = await db
    .select({ id: clients.id, badgerCompanyId: clients.badgerCompanyId })
    .from(clients)
    .where(inArray(clients.badgerCompanyId, ids));
  const existingByBadgerId = new Map(existing.map((r) => [r.badgerCompanyId, r.id]));

  let imported = 0;
  let updated = 0;

  for (const c of won) {
    const existingId = existingByBadgerId.get(c.companyId);
    if (existingId) {
      await db.update(clients).set({
        badgerOpportunityId: c.opportunityId,
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
        badgerCompanyId: c.companyId,
        badgerOpportunityId: c.opportunityId,
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
          actor: 'cli',
          targetType: 'client',
          targetId: row.id,
          payload: { badgerCompanyId: c.companyId, opportunityId: c.opportunityId },
        });
      }
    }
  }

  console.log(`✓ imported ${imported}, updated ${updated}, total ${won.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
