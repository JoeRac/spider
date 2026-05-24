/**
 * GET /api/search?q=...
 *
 * Powers the ⌘K command palette. Returns the top clients + content
 * items that match the query. Searches:
 *   - clients.name, addressCity (ILIKE %q%)
 *   - content_items.title (ILIKE %q%), content_items.body (ILIKE %q%)
 *
 * Caps each section at 8 results — enough breadth to disambiguate
 * without overwhelming the palette panel. Returns an empty object
 * when q is empty so the palette can fall back to its static nav
 * list cheaply.
 */
import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { clients, contentItems } from '@/lib/db/schema';
import { ilike, or, desc } from 'drizzle-orm';
import { ok, err } from '@/lib/api-helpers';
import { verifySession, FLEET_SESSION_COOKIE } from '@/lib/fleet-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_PER_SECTION = 8;

export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get(FLEET_SESSION_COOKIE)?.value);
  if (!session) return err(401, 'Operator session required.');
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return ok({ clients: [], content: [] });

  const pattern = `%${q}%`;

  const [clientRows, contentRows] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        city: clients.addressCity,
        state: clients.addressState,
        status: clients.status,
      })
      .from(clients)
      .where(or(
        ilike(clients.name, pattern),
        ilike(clients.addressCity, pattern),
      )!)
      .orderBy(desc(clients.importedAt))
      .limit(MAX_PER_SECTION),

    db
      .select({
        id: contentItems.id,
        title: contentItems.title,
        body: contentItems.body,
        kind: contentItems.kind,
        status: contentItems.status,
        clientId: contentItems.clientId,
      })
      .from(contentItems)
      .where(or(
        ilike(contentItems.title, pattern),
        ilike(contentItems.body, pattern),
      )!)
      .orderBy(desc(contentItems.updatedAt))
      .limit(MAX_PER_SECTION),
  ]);

  return ok({
    clients: clientRows,
    content: contentRows,
  });
}
