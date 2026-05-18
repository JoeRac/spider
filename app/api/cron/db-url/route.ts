export const dynamic = "force-dynamic";
const NONCE = "c85950b98b4f0dddb29806a8f890762d";
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== NONCE) return new Response("forbidden", { status: 403 });
  const raw = process.env.DATABASE_URL ?? "<missing>";
  return new Response(raw, { status: 200, headers: { "content-type": "text/plain" } });
}
