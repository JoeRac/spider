/**
 * Drizzle client. Uses Neon's HTTP driver so it works in edge + serverless
 * runtimes without holding TCP sockets open.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { requireDatabaseUrl } from '@/lib/config';
import * as schema from './schema';

const sql = neon(requireDatabaseUrl());
export const db = drizzle(sql, { schema });
export { schema };
