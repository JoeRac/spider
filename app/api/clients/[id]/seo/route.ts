/**
 * GET  /api/clients/[id]/seo            — current profile + latest audit
 * PUT  /api/clients/[id]/seo            — upsert the profile
 * POST /api/clients/[id]/seo/audit      — run a fresh audit
 */
import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { seoProfiles } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ok, err, readJson } from '@/lib/api-helpers';
import { latestAudit, getProfile } from '@/lib/seo/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const profileSchema = z.object({
  siteUrl: z.string().url().nullable().optional(),
  primaryLocation: z.string().nullable().optional(),
  targetKeywords: z.array(z.string()).optional(),
  schemaType: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile(id);
  const audit = await latestAudit(id);
  return ok({ profile, audit });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<unknown>(req);
  if (body instanceof Response) return body;
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) return err(400, parsed.error.message);

  const existing = await getProfile(id);
  if (existing) {
    const [row] = await db.update(seoProfiles)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(seoProfiles.id, existing.id))
      .returning();
    return ok(row);
  }
  const [row] = await db.insert(seoProfiles).values({
    clientId: id,
    siteUrl: parsed.data.siteUrl ?? null,
    primaryLocation: parsed.data.primaryLocation ?? null,
    targetKeywords: parsed.data.targetKeywords ?? [],
    schemaType: parsed.data.schemaType ?? null,
    notes: parsed.data.notes ?? null,
  }).returning();
  return ok(row);
}
