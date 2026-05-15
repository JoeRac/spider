import { type NextRequest, NextResponse } from 'next/server';
import {
  FLEET_SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSession,
  silverbackLoginUrl,
  verifyHandoff,
} from '@/lib/fleet-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const nextRaw = req.nextUrl.searchParams.get('next') ?? '/';

  let target: URL;
  try {
    target = new URL(nextRaw, req.nextUrl.origin);
    if (target.origin !== req.nextUrl.origin) target = new URL('/', req.nextUrl.origin);
  } catch { target = new URL('/', req.nextUrl.origin); }

  const handoff = await verifyHandoff(token);
  if (!handoff) {
    return NextResponse.redirect(silverbackLoginUrl(target.toString()));
  }

  const sessionValue = await signSession(handoff.sub);
  const res = NextResponse.redirect(target.toString());
  res.cookies.set({
    name: FLEET_SESSION_COOKIE,
    value: sessionValue,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
