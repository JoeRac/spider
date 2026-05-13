/**
 * Website blog — the only non-OAuth channel.
 *
 * Two supported modes (operator picks one in the connect UI):
 *   1. **WordPress REST API** — store base URL + application password.
 *   2. **Generic webhook** — store a POST URL; Spider sends a JSON payload
 *      on publish (`{ title, body, mediaUrls, scheduledFor }`). The
 *      receiver is responsible for translating to whatever CMS is on the
 *      other end (Ghost, custom static-site pipeline, Zapier, etc.).
 *
 * No OAuth — connection is a manual form. This adapter exists mostly so
 * the registry has consistent metadata for the UI to render; the actual
 * "connect" path is a dedicated route, not the OAuth dance.
 */
import type { ChannelAdapter, AuthUrlContext, ExchangeCodeContext, ExchangeCodeResult } from './types';

export const websiteBlogAdapter: ChannelAdapter = {
  channel: 'website_blog',
  label: 'Website blog',
  kind: 'manual',
  scopes: ['publish_post'],

  isConfigured() {
    return true; // no platform OAuth app needed
  },

  buildAuthUrl(_ctx: AuthUrlContext): string {
    throw new Error('Website blog uses manual configuration, not OAuth.');
  },

  async exchangeCode(_ctx: ExchangeCodeContext): Promise<ExchangeCodeResult> {
    throw new Error('Website blog uses manual configuration, not OAuth.');
  },
};
