/**
 * IndexNow submission — pings Bing/Yandex/etc with one API call.
 *
 * Real IndexNow needs a key file hosted on the target site. Since
 * Spider doesn't own client sites, we use the lightweight "url-by-url"
 * variant via the shared endpoint at api.indexnow.org which forwards
 * to the participating engines.
 *
 * When INDEXNOW_KEY is set in env, requests include it; when absent we
 * still call the endpoint (some engines accept anonymous pings as
 * "hint" requests; Bing logs them either way).
 */
import { db } from '@/lib/db';
import { seoIndexPings } from '@/lib/db/schema';

export type IndexNowResult = {
  url: string;
  status: 'submitted' | 'failed';
  response?: string;
};

export async function pingIndexNow(clientId: string, url: string): Promise<IndexNowResult> {
  const key = process.env.INDEXNOW_KEY;
  const host = new URL(url).host;

  const body = key
    ? { host, key, urlList: [url] }
    : { host, urlList: [url] };

  let result: IndexNowResult;
  try {
    const res = await fetch('https://api.indexnow.org/IndexNow', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    result = res.ok
      ? { url, status: 'submitted', response: `${res.status} ${res.statusText}` }
      : { url, status: 'failed', response: `${res.status}: ${(await res.text()).slice(0, 200)}` };
  } catch (e) {
    result = { url, status: 'failed', response: e instanceof Error ? e.message : 'network error' };
  }

  await db.insert(seoIndexPings).values({
    clientId, url, provider: 'indexnow', status: result.status, response: result.response ?? null,
  });
  return result;
}
