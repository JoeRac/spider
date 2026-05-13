import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { contentItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ok, err, readJson } from '@/lib/api-helpers';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
  if (!row) return err(404, 'Content not found');
  return ok(row);
}

const patchSchema = z.object({
  title: z.string().nullable().optional(),
  body: z.string().optional(),
  status: z.enum(['draft', 'scheduled', 'published', 'failed', 'archived']).optional(),
  scheduledFor: z.string().nullable().optional(),
  /** Shallow-merge into the existing metadata blob. Used by the variants
   *  editor to update `metadata.variants` without clobbering hashtags etc. */
  metadataPatch: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<z.infer<typeof patchSchema>>(req);
  if (body instanceof Response) return body;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err(400, parsed.error.message);

  const next: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) next.title = parsed.data.title;
  if (parsed.data.body !== undefined) next.body = parsed.data.body;
  if (parsed.data.status !== undefined) next.status = parsed.data.status;
  if (parsed.data.scheduledFor !== undefined) {
    next.scheduledFor = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null;
  }

  if (parsed.data.metadataPatch) {
    const [existing] = await db.select({ metadata: contentItems.metadata }).from(contentItems).where(eq(contentItems.id, id)).limit(1);
    next.metadata = { ...(existing?.metadata ?? {}), ...parsed.data.metadataPatch };
  }

  const [row] = await db.update(contentItems).set(next).where(eq(contentItems.id, id)).returning();
  if (!row) return err(404, 'Content not found');
  return ok(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(contentItems).where(eq(contentItems.id, id));
  return ok({ id, deleted: true });
}
