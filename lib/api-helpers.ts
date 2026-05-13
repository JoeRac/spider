/**
 * Tiny route-handler helpers so every endpoint returns the same envelope.
 * Mirrors Badger's pattern: `{ data }` on success, `{ error }` on failure.
 */
import { NextResponse } from 'next/server';

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function err(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<T>(req: Request): Promise<T | NextResponse> {
  try {
    return (await req.json()) as T;
  } catch {
    return err(400, 'Invalid JSON body');
  }
}
