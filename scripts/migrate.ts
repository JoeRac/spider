/**
 * Drizzle migration runner. `pnpm db:migrate` invokes this against the
 * production DB (or whatever DATABASE_URL_DIRECT points at).
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_DIRECT (or DATABASE_URL) is required.');
  process.exit(1);
}

async function main() {
  const sql = neon(url!);
  const db = drizzle(sql);
  console.log('▸ running migrations from ./drizzle');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('✓ migrations applied');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
