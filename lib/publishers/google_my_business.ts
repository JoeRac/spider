/**
 * Google My Business publisher — creates a `localPost` on the connected
 * location. Phase 4 limitation: we publish to the *first* location under
 * the connected account. A future iteration adds a per-client location
 * picker so multi-location dealerships can target the right pin.
 */
import type { ChannelPublisher, PublishContext, PublishResult } from './types';

const BIZ_INFO = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const BIZ_POSTS = 'https://mybusiness.googleapis.com/v4';

export const googleMyBusinessPublisher: ChannelPublisher = {
  channel: 'google_my_business',
  async publish(ctx: PublishContext): Promise<PublishResult> {
    const access = (ctx.credentials.access_token as string | undefined) ?? '';
    const accountId = ctx.externalIds.account_id;
    if (!access) throw new Error('GMB integration has no access_token (refresh first?)');
    if (!accountId) throw new Error('GMB account_id not resolved — reconnect.');

    // Resolve a location under the account.
    const locsRes = await fetch(`${BIZ_INFO}/${accountId}/locations?pageSize=1&readMask=name,title`, {
      headers: { authorization: `Bearer ${access}` },
    });
    if (!locsRes.ok) throw new Error(`GMB locations ${locsRes.status}: ${await locsRes.text()}`);
    const locs = await locsRes.json() as { locations?: Array<{ name?: string }> };
    const locName = locs.locations?.[0]?.name;
    if (!locName) throw new Error('GMB connected account has no locations.');

    const postUrl = `${BIZ_POSTS}/${accountId}/${locName}/localPosts`;
    const res = await fetch(postUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        languageCode: 'en-US',
        summary: ctx.item.body,
        topicType: 'STANDARD',
      }),
    });
    if (!res.ok) throw new Error(`GMB publish ${res.status}: ${await res.text()}`);
    const body = await res.json() as { name?: string; searchUrl?: string };
    return { externalId: body.name ?? '', externalUrl: body.searchUrl ?? null };
  },
};
