/**
 * Drizzle migration runner. `pnpm db:migrate` invokes this against the
 * production DB (or whatever DATABASE_URL_DIRECT points at).
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_DIRECT (or DATABASE_URL) is required.');
  process.exit(1);
}

async function main() {
  const sql = postgres(url!, { prepare: false, max: 1 });
  const db = drizzle(sql);
  console.log('▸ running migrations from ./drizzle');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('✓ migrations applied');
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
