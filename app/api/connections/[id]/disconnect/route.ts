/**
 * POST /api/integrations/[id]/disconnect
 *
 * Tears down a connection: best-effort provider-side revoke followed by
 * wiping local credentials and externalIds. Status flips to 'disconnected'.
 */
import { type NextRequest } from 'next/server';
import { ok, err } from '@/lib/api-helpers';
import { findIntegrationById, disconnectIntegration } from '@/lib/integration-store';
import { getAdapter } from '@/lib/channels/registry';
import { type Channel } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const integration = await findIntegrationById(id);
  if (!integration) return err(404, 'Integration not found');

  const adapter = getAdapter(integration.channel as Channel);
  if (adapter.disconnect) {
    try { await adapter.disconnect({ credentials: integration.credentials }); }
    catch { /* best effort */ }
  }
  await disconnectIntegration(id);
  return ok({ id, status: 'disconnected' });
}
