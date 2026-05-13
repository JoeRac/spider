/**
 * LinkedIn publisher — POSTs a UGC post via the v2 API.
 *
 * Currently posts as the authenticated member (personal profile). To post
 * as an organisation Page we'd swap the `author` URN to `urn:li:organization:{id}`
 * and require the `w_organization_social` scope. Phase 4 ships member
 * posting only; org pages are a phase-5 extension.
 */
import type { ChannelPublisher, PublishContext, PublishResult } from './types';

export const linkedinPublisher: ChannelPublisher = {
  channel: 'linkedin',
  async publish(ctx: PublishContext): Promise<PublishResult> {
    const access = (ctx.credentials.access_token as string | undefined) ?? '';
    const author = ctx.externalIds.member_urn;
    if (!access) throw new Error('LinkedIn integration has no access_token');
    if (!author) throw new Error('LinkedIn integration has no member_urn — reconnect.');

    const payload = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: ctx.item.body },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };

    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access}`,
        'content-type': 'application/json',
        'x-restli-protocol-version': '2.0.0',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`LinkedIn publish ${res.status}: ${await res.text()}`);
    const body = await res.json() as { id?: string };
    const id = body.id ?? '';
    return { externalId: id, externalUrl: id ? `https://www.linkedin.com/feed/update/${id}` : null };
  },
};
