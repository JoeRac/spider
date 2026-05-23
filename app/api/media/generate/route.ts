/**
 * POST /api/media/generate
 * Body: { clientId, contentItemId?, prompt, size? }
 *
 * Calls Z.AI's image-generation endpoint (CogView family). The model
 * returns a URL; we re-stream it into our Blob store so the link is
 * stable. If `contentItemId` is provided, the resulting URL is appended
 * to the item's mediaUrls.
 */
import { type NextRequest } from 'next/server';
import { ok, err, readJson } from '@/lib/api-helpers';
import { config } from '@/lib/config';
import { putBlob, pathFor } from '@/lib/blob';
import { db } from '@/lib/db';
import { contentItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { isSafeHttpUrl } from '@/lib/security/safe-url';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

type Body = {
  clientId: string;
  contentItemId?: string;
  prompt: string;
  size?: '512x512' | '768x768' | '1024x1024' | '1280x720' | '1024x1792';
  model?: string;
};

const DEFAULT_IMAGE_MODEL = process.env.ZAI_IMAGE_MODEL ?? 'cogview-3-plus';

export async function POST(req: NextRequest) {
  const body = await readJson<Body>(req);
  if (body instanceof Response) return body;
  if (!body?.clientId) return err(400, 'clientId required');
  if (!body?.prompt) return err(400, 'prompt required');
  if (!config.zaiApiKey) return err(503, 'ZAI_API_KEY not configured');

  const size = body.size ?? '1024x1024';
  const model = body.model ?? DEFAULT_IMAGE_MODEL;

  // Z.AI image-generation endpoint is OpenAI-compatible: /images/generations.
  const url = `${config.zaiBaseUrl.replace(/\/$/, '')}/images/generations`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.zaiApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, prompt: body.prompt, size }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return err(502, `Z.AI image ${res.status}: ${text.slice(0, 300)}`);
  }
  const payload = await res.json() as { data?: Array<{ url?: string; b64_json?: string }> };
  const first = payload.data?.[0];
  if (!first?.url && !first?.b64_json) return err(502, 'Z.AI returned no image');

  // Re-stream into Blob so the URL is stable even if Z.AI rotates theirs.
  let buf: Buffer;
  let contentType = 'image/png';
  if (first.url) {
    // SSRF guard: AI model may return attacker-influenced URLs; block private targets.
    if (!isSafeHttpUrl(first.url)) {
      return err(502, 'Generated image URL rejected by SSRF guard');
    }
    const fetched = await fetch(first.url);
    if (!fetched.ok) return err(502, `Failed to fetch generated image: ${fetched.status}`);
    contentType = fetched.headers.get('content-type') ?? contentType;
    buf = Buffer.from(await fetched.arrayBuffer());
  } else {
    buf = Buffer.from(first.b64_json!, 'base64');
  }

  const path = pathFor({ clientId: body.clientId, contentItemId: body.contentItemId, name: `ai-${Date.now()}.png` });
  let blob;
  try {
    blob = await putBlob(path, buf, { contentType });
  } catch (e) {
    return err(502, e instanceof Error ? e.message : 'Blob upload failed');
  }

  if (body.contentItemId) {
    const [existing] = await db.select({ mediaUrls: contentItems.mediaUrls })
      .from(contentItems).where(eq(contentItems.id, body.contentItemId)).limit(1);
    const next = [...(existing?.mediaUrls ?? []), blob.url];
    await db.update(contentItems).set({ mediaUrls: next, updatedAt: new Date() }).where(eq(contentItems.id, body.contentItemId));
  }

  return ok({ url: blob.url, pathname: blob.pathname, model, prompt: body.prompt });
}
