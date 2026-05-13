/**
 * POST /api/integrations/[id]/refresh
 *
 * Forces a token refresh via the adapter's refresh path. Useful when the
 * operator suspects the connection is stale; phase 4's cron worker will
 * also call this just-in-time before publishing.
 */
import { type NextRequest } from 'next/server';
import { ok, err } from '@/lib/api-helpers';
import { findIntegrationById, upsertConnectedIntegration, recordIntegrationError } from '@/lib/integration-store';
import { getAdapter } from '@/lib/channels/registry';
import { type Channel } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const integration = await findIntegrationById(id);
  if (!integration) return err(404, 'Integration not found');

  const adapter = getAdapter(integration.channel as Channel);
  if (!adapter.refresh) {
    return err(400, `${adapter.label} does not support token refresh.`);
  }

  try {
    const result = await adapter.refresh({ credentials: integration.credentials });
    await upsertConnectedIntegration({
      clientId: integration.clientId,
      channel: integration.channel as Channel,
      credentials: result.credentials,
      externalIds: { ...integration.externalIds, ...result.externalIds },
      expiresAt: result.expiresAt ?? null,
    });
    return ok({ id, refreshed: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'refresh failed';
    await recordIntegrationError(id, message);
    return err(500, message);
  }
}
