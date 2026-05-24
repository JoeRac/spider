/**
 * GET  /api/clients/[id]/citations         — catalog + per-client statuses
 * PUT  /api/clients/[id]/citations         — upsert one row
 *         body: { directoryKey, status?, url?, notes? }
 */
import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { seoCitations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { ok, err, readJson } from '@/lib/api-helpers';
import { CITATION_DIRECTORIES, getDirectory } from '@/lib/seo/citations';
import { verifySession, FLEET_SESSION_COOKIE } from '@/lib/fleet-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession(req.cookies.get(FLEET_SESSION_COOKIE)?.value);
  if (!session) return err(401, 'Operator session required.');
  const { id } = await params;
  const rows = await db.select().from(seoCitations).where(eq(seoCitations.clientId, id));
  const byKey = new Map(rows.map((r) => [r.directoryKey, r]));
  const items = CITATION_DIRECTORIES.map((d) => {
    const row = byKey.get(d.key);
    return {
      directory: d,
      status: row?.status ?? 'missing',
      url: row?.url ?? null,
      notes: row?.notes ?? null,
      lastCheckedAt: row?.lastCheckedAt ?? null,
    };
  });
  return ok({ items });
}

const putSchema = z.object({
  directoryKey: z.string(),
  status: z.enum(['missing', 'partial', 'complete', 'na']).optional(),
  url: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session2 = await verifySession(req.cookies.get(FLEET_SESSION_COOKIE)?.value);
  if (!session2) return err(401, 'Operator session required.');
  const { id } = await params;
  const body = await readJson<z.infer<typeof putSchema>>(req);
  if (body instanceof Response) return body;
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return err(400, parsed.error.message);
  if (!getDirectory(parsed.data.directoryKey)) return err(400, `Unknown directory: ${parsed.data.directoryKey}`);

  const existing = await db.select()
    .from(seoCitations)
    .where(and(eq(seoCitations.clientId, id), eq(seoCitations.directoryKey, parsed.data.directoryKey)))
    .limit(1);

  if (existing.length > 0) {
    const [row] = await db.update(seoCitations).set({
      ...parsed.data,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(seoCitations.id, existing[0]!.id)).returning();
    return ok(row);
  }
  const [row] = await db.insert(seoCitations).values({
    clientId: id,
    directoryKey: parsed.data.directoryKey,
    status: parsed.data.status ?? 'missing',
    url: parsed.data.url ?? null,
    notes: parsed.data.notes ?? null,
    lastCheckedAt: new Date(),
  }).returning();
  return ok(row);
}
