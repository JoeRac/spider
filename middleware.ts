/**
 * Edge middleware — operator-only gate for browser surfaces.
 *
 * Spider had no operator auth historically. The fleet SSO rollout
 * adds proper auth: every operator-visible path requires a valid
 * `fleet_session` cookie (set by Silverback's handoff).
 *
 * Public allowlist (NO auth needed):
 *   • /api/auth/*           the SSO callback itself
 *   • /api/integrations/*   siblings posting here with their own auth
 *   • /api/fleet/*          fleet probe (integration auth)
 *   • /api/cron/*           Vercel cron with CRON_SECRET
 *   • /api/health           liveness probe
 *
 * Everything else (admin pages + API) requires the operator.
 */
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PREFIXES = [
  '/api/auth/',
  '/api/integrations/',
  '/api/fleet/',
  '/api/cron/',
  '/_next/',
];
const PUBLIC_EXACT = new Set<string>(['/api/health', '/favicon.ico']);

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)).*)'],
  runtime: 'nodejs',
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_EXACT.has(pathname)) return NextResponse.next();
  for (const p of PUBLIC_PREFIXES) {
    if (pathname.startsWith(p)) return NextResponse.next();
  }

  const fleet = req.cookies.get('fleet_session')?.value;
  if (fleet && (await verifyFleetSessionEdge(fleet))) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: { code: 'unauthorized', message: 'Sign in via Silverback to continue.' } },
      { status: 401 },
    );
  }

  const silverback = process.env.SILVERBACK_BASE_URL || 'https://silverback-eight.vercel.app';
  const absoluteNext = `${req.nextUrl.origin}${pathname}${req.nextUrl.search}`;
  const loginUrl = new URL('/login', silverback.replace(/\/+$/, ''));
  loginUrl.searchParams.set('next', absoluteNext);
  return NextResponse.redirect(loginUrl.toString());
}

async function verifyFleetSessionEdge(token: string): Promise<boolean> {
  const secret = process.env.FLEET_SESSION_SECRET ?? '';
  if (!secret) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign'],
    );
    const expectedBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body!)));
    const expected = b64urlFromBytes(expectedBytes);
    if (expected.length !== sig!.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ sig!.charCodeAt(i);
    if (mismatch !== 0) return false;
    const json = b64urlToString(body!);
    if (!json) return false;
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000);
  } catch { return false; }
}
function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToString(s: string): string | null {
  try {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
    return atob(padded);
  } catch { return null; }
}
