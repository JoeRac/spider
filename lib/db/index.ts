import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { requireDatabaseUrl } from '@/lib/config';
import * as schema from './schema';

const sql = postgres(requireDatabaseUrl(), { prepare: false, max: 5, idle_timeout: 20, max_lifetime: 300 });
export const db = drizzle(sql, { schema });
export { schema };
