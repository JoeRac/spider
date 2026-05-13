/**
 * The DB write path for integrations. Encrypts credentials before storing
 * and decrypts on read. Every callback handler ends here.
 */
import { db } from '@/lib/db';
import { integrations, auditLog, type Integration, type Channel } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { encryptJSON, decryptJSON } from '@/lib/crypto';

export type IntegrationWithCredentials = Omit<Integration, 'credentials'> & {
  credentials: Record<string, unknown>;
};

export async function findIntegration(clientId: string, channel: Channel): Promise<IntegrationWithCredentials | null> {
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.clientId, clientId), eq(integrations.channel, channel)))
    .limit(1);
  if (!row) return null;
  return { ...row, credentials: decryptStored(row.credentials as unknown) };
}

export async function findIntegrationById(id: string): Promise<IntegrationWithCredentials | null> {
  const [row] = await db.select().from(integrations).where(eq(integrations.id, id)).limit(1);
  if (!row) return null;
  return { ...row, credentials: decryptStored(row.credentials as unknown) };
}

export async function upsertConnectedIntegration(opts: {
  clientId: string;
  channel: Channel;
  credentials: Record<string, unknown>;
  externalIds: Record<string, string>;
  expiresAt: Date | null;
}): Promise<IntegrationWithCredentials> {
  const existing = await findIntegration(opts.clientId, opts.channel);
  const encrypted = { __ciphertext: encryptJSON(opts.credentials) };

  if (existing) {
    const [row] = await db
      .update(integrations)
      .set({
        status: 'connected',
        credentials: encrypted,
        externalIds: opts.externalIds,
        lastSyncAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, existing.id))
      .returning();
    await audit(opts.clientId, opts.channel, existing.id, 'integration.reconnected');
    return { ...row!, credentials: opts.credentials };
  }

  const [row] = await db
    .insert(integrations)
    .values({
      clientId: opts.clientId,
      channel: opts.channel,
      status: 'connected',
      credentials: encrypted,
      externalIds: opts.externalIds,
      lastSyncAt: new Date(),
    })
    .returning();
  await audit(opts.clientId, opts.channel, row!.id, 'integration.connected');
  return { ...row!, credentials: opts.credentials };
}

export async function recordIntegrationError(integrationId: string, error: string): Promise<void> {
  await db.update(integrations).set({ status: 'error', lastError: error, updatedAt: new Date() }).where(eq(integrations.id, integrationId));
}

export async function disconnectIntegration(integrationId: string): Promise<void> {
  const [row] = await db.select().from(integrations).where(eq(integrations.id, integrationId)).limit(1);
  if (!row) return;
  await db.update(integrations).set({
    status: 'disconnected',
    credentials: {},
    externalIds: {},
    lastError: null,
    lastSyncAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(integrations.id, integrationId));
  await audit(row.clientId, row.channel as Channel, integrationId, 'integration.disconnected');
}

async function audit(clientId: string, channel: Channel, integrationId: string, event: string): Promise<void> {
  await db.insert(auditLog).values({
    event,
    actor: 'operator',
    targetType: 'integration',
    targetId: integrationId,
    payload: { clientId, channel },
  });
}

function decryptStored(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  // New rows are wrapped under __ciphertext; pre-encryption rows are
  // returned as-is so we don't break already-stored test data.
  const obj = value as Record<string, unknown>;
  const ct = obj.__ciphertext;
  if (typeof ct === 'string') {
    try { return decryptJSON<Record<string, unknown>>(ct); }
    catch { return {}; }
  }
  return obj;
}
