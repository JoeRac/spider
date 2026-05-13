/**
 * DELETE /api/content/[id]/media?url=...
 * Removes a media URL from a content item. (We don't yet delete the blob
 * itself — that's a phase-6 storage hygiene task.)
 */
import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { contentItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ok, err } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return err(400, 'url query param required');
  const [row] = await db.select({ mediaUrls: contentItems.mediaUrls }).from(contentItems).where(eq(contentItems.id, id)).limit(1);
  if (!row) return err(404, 'Content not found');
  const next = (row.mediaUrls ?? []).filter((u) => u !== url);
  await db.update(contentItems).set({ mediaUrls: next, updatedAt: new Date() }).where(eq(contentItems.id, id));
  return ok({ remaining: next.length });
}
