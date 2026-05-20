/**
 * Badger API client — Spider pulls WON dealerships from here.
 *
 * Authentication: sibling-app integration scheme.
 *   - `Authorization: Bearer ${BADGER_API_KEY}` — long static token shared
 *     between Badger and its siblings.
 *   - `X-Integration-Timestamp` — current epoch millis, validated within
 *     ±5 minutes server-side. Defeats request replay.
 *   - `X-Integration-App: spider` — caller identity for the audit log.
 *
 * The endpoint we hit (`/api/integrations/won`) is added on the Badger side
 * — see `app/api/integrations/won/route.ts` in the Badger repo.
 */
import { config } from '@/lib/config';
import { mintTraceId } from '@/lib/trace';

export type BadgerWonClient = {
  /** Fleet-wide lead id (= badger.companies.id). Spider mirrors this as
   *  `clients.lead_id` (and, for one rotation of back-compat, also writes
   *  it to `clients.badger_company_id`).
   *
   *  Wire-name on the Badger side is `companyId` — we expose it as
   *  `leadId` here and remap in `fetchBadgerWonClients`. */
  leadId: string;

  name: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostcode: string | null;
  addressCountry: string | null;

  /** Stage label (will be the human label for the won stage). */
  stageLabel: string;
  /** When the lead first moved into the won stage. */
  wonAt: string | null;
  /** Dollar value, optional. */
  dealValue: number | null;
};

export async function fetchBadgerWonClients(): Promise<BadgerWonClient[]> {
  if (!config.badgerApiKey) {
    throw new Error('BADGER_API_KEY not configured — set it in .env.local and Vercel env.');
  }

  const url = `${config.badgerBaseUrl.replace(/\/$/, '')}/api/integrations/won`;
  const res = await fetch(url, {
    headers: {
      'authorization': `Bearer ${config.badgerApiKey}`,
      'x-integration-app': 'spider',
      'x-integration-timestamp': String(Date.now()),
      'x-trace-id': mintTraceId(),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Badger ${res.status}: ${text.slice(0, 200)}`);
  }

  type WireClient = Omit<BadgerWonClient, 'leadId'> & { companyId: string };
  const body = await res.json() as { clients?: WireClient[] };
  return (body.clients ?? []).map(({ companyId, ...rest }) => ({ leadId: companyId, ...rest }));
}
