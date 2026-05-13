/**
 * POST /api/content/generate
 * Body: { clientId, kind, quantity?, brief?, model? }
 */
import { type NextRequest } from 'next/server';
import { ok, err, readJson } from '@/lib/api-helpers';
import { runGeneration } from '@/lib/content/generate';
import { CONTENT_KINDS, type ContentKind } from '@/lib/content/templates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type Body = {
  clientId: string;
  kind: ContentKind;
  quantity?: number;
  brief?: string;
  model?: string;
  withVariants?: boolean;
};

export async function POST(req: NextRequest) {
  const body = await readJson<Body>(req);
  if (body instanceof Response) return body;
  if (!body?.clientId) return err(400, 'clientId required');
  if (!CONTENT_KINDS.includes(body.kind)) return err(400, `kind must be one of ${CONTENT_KINDS.join(', ')}`);

  const outcome = await runGeneration(body);
  if (outcome.status === 'failed') {
    return err(502, outcome.error ?? 'Generation failed');
  }
  return ok(outcome);
}
