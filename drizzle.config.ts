import { defineConfig } from 'drizzle-kit';
import { readFileSync } from 'node:fs';

// Best-effort .env.local loader — drizzle-kit doesn't pre-load dotenv and
// we don't want a forced runtime dep just for one CLI invocation.
try {
  const raw = readFileSync('.env.local', 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^"(.*)"$/, '$1');
  }
} catch { /* file may not exist in CI — config falls back to process.env */ }

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
