/**
 * Facebook + Instagram publishers — both flow through Meta's Graph API.
 *
 * Facebook: POST /v21.0/{page-id}/feed with `message` + page access token.
 * Instagram: two-step — POST /v21.0/{ig-id}/media to create a container,
 * then POST /v21.0/{ig-id}/media_publish with the container id. For
 * phase 4 we only support image-less text-with-image-URL captions; pure
 * text-only Instagram posts aren't supported by their API.
 */
import type { ChannelPublisher, PublishContext, PublishResult } from './types';

const GRAPH = 'https://graph.facebook.com/v21.0';

export const facebookPublisher: ChannelPublisher = {
  channel: 'facebook',
  async publish(ctx: PublishContext): Promise<PublishResult> {
    const pageId = ctx.externalIds.page_id;
    const pageToken = (ctx.credentials.page_access_token as string | undefined) ?? '';
    if (!pageId || !pageToken) throw new Error('Facebook missing page_id or page_access_token');

    const url = new URL(`${GRAPH}/${pageId}/feed`);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: ctx.item.body, access_token: pageToken }),
    });
    if (!res.ok) throw new Error(`Facebook publish ${res.status}: ${await res.text()}`);
    const body = await res.json() as { id?: string };
    const id = body.id ?? '';
    return {
      externalId: id,
      externalUrl: id ? `https://facebook.com/${id}` : null,
    };
  },
};

export const instagramPublisher: ChannelPublisher = {
  channel: 'instagram',
  async publish(ctx: PublishContext): Promise<PublishResult> {
    const igId = ctx.externalIds.instagram_account_id;
    const pageToken = (ctx.credentials.page_access_token as string | undefined) ?? '';
    if (!igId || !pageToken) throw new Error('Instagram missing instagram_account_id or page_access_token');
    const imageUrl = ctx.item.mediaUrls[0];
    if (!imageUrl) {
      throw new Error('Instagram posts require an image URL. Add one in the content editor.');
    }

    // Step 1: create media container.
    const createUrl = new URL(`${GRAPH}/${igId}/media`);
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption: ctx.item.body,
        access_token: pageToken,
      }),
    });
    if (!createRes.ok) throw new Error(`Instagram container ${createRes.status}: ${await createRes.text()}`);
    const created = await createRes.json() as { id?: string };
    const containerId = created.id ?? '';
    if (!containerId) throw new Error('Instagram container returned no id');

    // Step 2: publish the container.
    const publishUrl = new URL(`${GRAPH}/${igId}/media_publish`);
    const publishRes = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creation_id: containerId, access_token: pageToken }),
    });
    if (!publishRes.ok) throw new Error(`Instagram publish ${publishRes.status}: ${await publishRes.text()}`);
    const body = await publishRes.json() as { id?: string };
    return { externalId: body.id ?? '', externalUrl: null };
  },
};
