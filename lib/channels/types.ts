/**
 * Channel adapter contract.
 *
 * One adapter per channel. The registry (`lib/channels/registry.ts`) wires
 * them up; route handlers (`/api/integrations/[channel]/*`) dispatch into
 * them. Adding a new channel = adding a new adapter, no other code change.
 *
 * Lifecycle:
 *
 *   1. `isConfigured(env)`    — does this Spider instance have the OAuth
 *                                app credentials needed to start a flow?
 *                                (Most channels need a registered OAuth
 *                                app; if env vars are missing, the UI
 *                                says "configure first" and links to
 *                                Settings.)
 *
 *   2. `buildAuthUrl(...)`     — produces the URL we redirect the operator
 *                                to. The OAuth state token is embedded.
 *
 *   3. `exchangeCode(...)`     — callback handler: turns the `code` into
 *                                tokens + external IDs.
 *
 *   4. `refresh(...)`          — (optional) renews an expired access token
 *                                using the stored refresh token. Channels
 *                                with non-expiring tokens skip this.
 *
 *   5. `disconnect(...)`       — (optional) revoke the token with the
 *                                provider. We always wipe local state;
 *                                this is the provider-side revoke.
 *
 * Credentials shape is per-adapter. The `integrations.credentials` JSONB
 * stores it as an opaque encrypted blob — see `lib/crypto.ts`.
 */
import type { Channel } from '@/lib/db/schema';

export type ChannelKind = 'oauth' | 'manual';

export type AuthUrlContext = {
  state: string;
  redirectUri: string;
};

export type ExchangeCodeContext = {
  code: string;
  redirectUri: string;
};

export type ExchangeCodeResult = {
  credentials: Record<string, unknown>;
  externalIds: Record<string, string>;
  expiresAt?: Date | null;
};

export type RefreshContext = {
  credentials: Record<string, unknown>;
};

export type ChannelAdapter = {
  channel: Channel;
  label: string;
  kind: ChannelKind;

  /** Returns true when this Spider instance has the OAuth app envs set. */
  isConfigured(): boolean;

  /** Required scopes — informational, used by the UI to render the
   *  "what we'll be able to do" disclosure on the connect button. */
  scopes: string[];

  /** Builds the URL Spider redirects the operator to. */
  buildAuthUrl(ctx: AuthUrlContext): string;

  /** Exchanges an OAuth `code` for tokens + external IDs. */
  exchangeCode(ctx: ExchangeCodeContext): Promise<ExchangeCodeResult>;

  /** Optional: refresh an expiring access token. */
  refresh?(ctx: RefreshContext): Promise<ExchangeCodeResult>;

  /** Optional: provider-side revoke. */
  disconnect?(ctx: RefreshContext): Promise<void>;
};
