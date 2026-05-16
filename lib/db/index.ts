import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { requireDatabaseUrl } from '@/lib/config';
import * as schema from './schema';

const sql = postgres(requireDatabaseUrl(), { prepare: false, max: 1 });
export const db = drizzle(sql, { schema });
export { schema };
