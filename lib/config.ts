/**
 * Single source of truth for env-derived configuration.
 *
 * Read env once at import time; everything else imports from here so we don't
 * have `process.env.X` references sprinkled across the codebase.
 */

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  databaseUrlDirect: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? '',

  /** Badger connection — Spider pulls WON clients from here. */
  badgerBaseUrl: process.env.BADGER_BASE_URL ?? 'https://badger-gray.vercel.app',
  badgerApiKey: process.env.BADGER_API_KEY ?? '',

  /** Z.AI GLM — content generation backbone (wired in phase 3). */
  zaiApiKey: process.env.ZAI_API_KEY ?? '',
  zaiBaseUrl: process.env.ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4',
  zaiModel: process.env.ZAI_MODEL ?? 'glm-4.6',

  /** Cron secret — gates /api/cron/* so only Vercel cron can invoke. */
  cronSecret: process.env.CRON_SECRET ?? '',

  publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:3000',
} as const;

export function requireDatabaseUrl(): string {
  return required('DATABASE_URL', config.databaseUrl);
}
