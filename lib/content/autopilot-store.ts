/**
 * Server-only persistence for the autopilot policy.
 *
 * Lives in its own file so the pure helpers in `./autopilot.ts` stay
 * importable from client components without pulling the postgres
 * driver into the browser bundle.
 */
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { autopilotSchema, type AutopilotPolicy } from './autopilot';

export async function updateAutopilot(clientId: string, policy: AutopilotPolicy): Promise<AutopilotPolicy> {
  const cleaned = autopilotSchema.parse(policy);
  const [row] = await db.select({ settings: clients.settings }).from(clients).where(eq(clients.id, clientId)).limit(1);
  const next = { ...(row?.settings ?? {}), autopilot: cleaned };
  await db.update(clients).set({ settings: next, updatedAt: new Date() }).where(eq(clients.id, clientId));
  return cleaned;
}
