import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { requireDatabaseUrl } from '@/lib/config';
import * as schema from './schema';

// fetch_types:false skips postgres.js's per-connection pg_type introspection
// (~500 rows fetched on every new connection) — the top Supabase-egress source
// fleet-wide under serverless churn. Safe: Spider has no Postgres array columns
// (the only thing the fetch is needed to parse).
const sql = postgres(requireDatabaseUrl(), { prepare: false, fetch_types: false, max: 5, idle_timeout: 20, max_lifetime: 300 });
export const db = drizzle(sql, { schema });
export { schema };
