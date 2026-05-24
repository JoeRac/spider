/**
 * POST /api/clients/[id]/autopilot/run
 *
 * Manual one-client autopilot tick. Identical logic to the daily cron,
 * just scoped to a single client and gated by the regular operator-auth
 * route (Silverback SSO) rather than CRON_SECRET.
 *
 * Use case: the operator wants to verify the loop works end-to-end for a
 * specific client without waiting for 14:00 UTC. The shared helper
 * `runAutopilotTickForClient` ensures the cron and this route can never
 * disagree.
 */
import { type NextRequest } from 'next/server';
import { runAutopilotTickForClient } from '@/lib/content/autopilot-run';
import { ok, err } from '@/lib/api-helpers';
import { verifySession, FLEET_SESSION_COOKIE } from '@/lib/fleet-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession(req.cookies.get(FLEET_SESSION_COOKIE)?.value);
  if (!session) return err(401, 'Operator session required.');
  const { id } = await params;
  const result = await runAutopilotTickForClient(id);
  if (result.status === 'not-found') return err(404, 'Client not found');
  return ok(result);
}
