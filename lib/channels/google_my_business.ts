import { makeGoogleAdapter } from './google';

/**
 * Google My Business — operates on `accountManagement` to list the operator's
 * GMB accounts, then `mybusinessbusinessinformation` to list locations and
 * (in phase 4) post to them.
 *
 * On connect we resolve the first GMB account id and stash it; the operator
 * can re-pick a different location later via the integration settings panel
 * (phase 4).
 */
export const googleMyBusinessAdapter = makeGoogleAdapter({
  channel: 'google_my_business',
  label: 'Google My Business',
  scopes: ['https://www.googleapis.com/auth/business.manage'],
  async resolveIds(tokens): Promise<Record<string, string>> {
    try {
      const res = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=10', {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      if (!res.ok) return {};
      const body = await res.json() as { accounts?: Array<{ name?: string; accountName?: string }> };
      const first = body.accounts?.[0];
      if (!first?.name) return {};
      return { account_id: first.name, account_name: first.accountName ?? '' };
    } catch {
      return {};
    }
  },
});
