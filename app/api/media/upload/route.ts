/**
 * POST /api/media/upload
 * multipart/form-data: { file: File, clientId: string, contentItemId?: string }
 *
 * Stores the file in Vercel Blob and, if `contentItemId` is provided,
 * appends the returned URL to that content item's mediaUrls list.
 */
import { type NextRequest } from 'next/server';
import { ok, err } from '@/lib/api-helpers';
import { putBlob, pathFor } from '@/lib/blob';
import { db } from '@/lib/db';
import { contentItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifySession, FLEET_SESSION_COOKIE } from '@/lib/fleet-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(req: NextRequest) {
  const session = await verifySession(req.cookies.get(FLEET_SESSION_COOKIE)?.value);
  if (!session) return err(401, 'Operator session required.');
  const form = await req.formData().catch(() => null);
  if (!form) return err(400, 'multipart/form-data required');
  const file = form.get('file');
  const clientId = String(form.get('clientId') ?? '');
  const contentItemId = form.get('contentItemId') ? String(form.get('contentItemId')) : undefined;
  if (!(file instanceof File)) return err(400, 'file is required');
  if (!clientId) return err(400, 'clientId is required');
  if (file.size > MAX_BYTES) return err(413, `File too large (${file.size} > ${MAX_BYTES}).`);

  const path = pathFor({ clientId, contentItemId, name: file.name || 'upload.bin' });
  const buf = Buffer.from(await file.arrayBuffer());

  let blob;
  try {
    blob = await putBlob(path, buf, { contentType: file.type || 'application/octet-stream' });
  } catch (e) {
    return err(502, e instanceof Error ? e.message : 'Blob upload failed');
  }

  if (contentItemId) {
    const [existing] = await db.select({ mediaUrls: contentItems.mediaUrls })
      .from(contentItems).where(eq(contentItems.id, contentItemId)).limit(1);
    const next = [...(existing?.mediaUrls ?? []), blob.url];
    await db.update(contentItems).set({ mediaUrls: next, updatedAt: new Date() }).where(eq(contentItems.id, contentItemId));
  }

  return ok({ url: blob.url, pathname: blob.pathname, contentType: blob.contentType });
}
