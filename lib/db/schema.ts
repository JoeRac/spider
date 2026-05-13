/**
 * Spider schema — source of truth for the database.
 *
 * Conceptual model:
 *   - `clients`           — every WON dealership imported from Badger. The
 *                           central entity Spider revolves around. One client
 *                           = one set of channel integrations + a stream of
 *                           generated content.
 *   - `integrations`      — per-client connections to external surfaces
 *                           (Google My Business, Facebook, Twitter, YouTube,
 *                           …). Holds OAuth tokens, profile IDs, and the
 *                           last-known status.
 *   - `content_items`     — the unit of generated content. One row per piece
 *                           (a GMB post, a tweet, a YouTube description, …).
 *                           Lifecycle: draft → scheduled → published | failed.
 *   - `content_targets`   — fan-out: a single content_item can be sent to N
 *                           channels. Each (item, integration) pair becomes
 *                           one target row tracking that publish attempt.
 *   - `generation_runs`   — audit + retry record for AI generation calls. We
 *                           keep prompt, model, raw response, cost.
 *   - `jobs`              — generic in-app job queue. Used by phase 3+
 *                           workflows for scheduling generation + publish.
 *   - `audit_log`         — append-only history of mutations. Read-friendly.
 *
 * Phase boundaries:
 *   Phase 1 ⇒ clients + integrations (skeleton) + audit_log
 *   Phase 2 ⇒ integrations fully wired with OAuth state
 *   Phase 3 ⇒ content_items + content_targets + generation_runs
 *   Phase 4 ⇒ jobs + cron-driven publish loop
 */
import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/* ──────────────────────────────────────────────────────────────────────────
   Clients
   ────────────────────────────────────────────────────────────────────────── */

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** The Badger company id this client was imported from. Stable across
   *  re-imports — we upsert on this key. */
  badgerCompanyId: uuid('badger_company_id').notNull(),

  /** Optional Badger opportunity id (the deal that closed-as-won). Kept for
   *  drill-down; null if the client was created manually. */
  badgerOpportunityId: uuid('badger_opportunity_id'),

  /** Display name — usually the dealership name from Badger. Editable. */
  name: text('name').notNull(),

  /** Pulled from Badger on import. Mutable in Spider afterwards because the
   *  client may give us different details (e.g. their preferred website
   *  domain for SEO work). */
  website: text('website'),
  phone: text('phone'),
  email: text('email'),
  addressStreet: text('address_street'),
  addressCity: text('address_city'),
  addressState: text('address_state'),
  addressPostcode: text('address_postcode'),
  addressCountry: text('address_country'),

  /** Free-form short description. The content engine uses this as primary
   *  context when generating posts ("Used-car dealership in Phoenix, AZ
   *  specialising in trucks and SUVs"). */
  description: text('description'),

  /** Status of the engagement.
   *  - 'onboarding': just imported, needs integrations connected
   *  - 'active': at least one integration is live and content is flowing
   *  - 'paused': operator paused all automation
   *  - 'archived': we stopped working with them */
  status: text('status').notNull().default('onboarding'),

  /** Free-form tags surfaced as chips in the UI. */
  tags: jsonb('tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),

  /** Per-client knobs (cadence, voice, exclusions). Schema-less for now so
   *  we can iterate fast; we'll formalise as the workflow matures. */
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  badgerCompanyIdx: uniqueIndex('clients_badger_company_idx').on(t.badgerCompanyId),
  statusIdx: index('clients_status_idx').on(t.status),
}));

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;

/* ──────────────────────────────────────────────────────────────────────────
   Integrations — one row per (client, channel)
   ────────────────────────────────────────────────────────────────────────── */

/** Supported channels. Adding here makes it appear in the UI's integration
 *  matrix; the actual OAuth + publish glue ships in phase 2/4. */
export const CHANNELS = [
  'google_my_business',
  'facebook',
  'twitter',
  'youtube',
  'instagram',
  'linkedin',
  'tiktok',
  'website_blog',
] as const;
export type Channel = (typeof CHANNELS)[number];

export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),

  channel: text('channel').$type<Channel>().notNull(),

  /** 'disconnected' | 'connected' | 'error' | 'expired'. */
  status: text('status').notNull().default('disconnected'),

  /** Channel-specific identifiers: GMB locationId, Facebook page id, Twitter
   *  user id, YouTube channel id, … kept as a single JSON blob so the schema
   *  doesn't churn every time we add a channel. */
  externalIds: jsonb('external_ids').$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),

  /** OAuth tokens + expiry. Encrypted at rest (we'll wire the encryption in
   *  phase 2). Don't read this directly from the UI. */
  credentials: jsonb('credentials').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

  /** Last sync diagnostics — surfaced as the "last checked / last error"
   *  line in the integration card. */
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastError: text('last_error'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientChannelIdx: uniqueIndex('integrations_client_channel_idx').on(t.clientId, t.channel),
  clientIdx: index('integrations_client_idx').on(t.clientId),
}));

export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;

/* ──────────────────────────────────────────────────────────────────────────
   Content — items + fan-out targets + AI generation audit
   (Schema is laid out now; UI wires up in phase 3.)
   ────────────────────────────────────────────────────────────────────────── */

export const contentItems = pgTable('content_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),

  /** 'post' | 'article' | 'tweet' | 'video_desc' | 'reply' — used to pick
   *  templates and validate length constraints. */
  kind: text('kind').notNull(),

  /** Plain-text title shown in the library list. Optional for tweets. */
  title: text('title'),

  /** The canonical content. Markdown for articles, plain text otherwise. */
  body: text('body').notNull(),

  /** Optional attached media URLs (Vercel Blob in phase 3). */
  mediaUrls: jsonb('media_urls').$type<string[]>().notNull().default(sql`'[]'::jsonb`),

  /** 'draft' | 'scheduled' | 'published' | 'failed' | 'archived'. */
  status: text('status').notNull().default('draft'),

  /** When the item should publish (UTC). Null = no schedule yet. */
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),

  /** Which generation_run produced this — null if hand-authored. */
  generationRunId: uuid('generation_run_id'),

  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientIdx: index('content_items_client_idx').on(t.clientId),
  statusIdx: index('content_items_status_idx').on(t.status),
  scheduledIdx: index('content_items_scheduled_idx').on(t.scheduledFor),
}));

export const contentTargets = pgTable('content_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentItemId: uuid('content_item_id').notNull().references(() => contentItems.id, { onDelete: 'cascade' }),
  integrationId: uuid('integration_id').notNull().references(() => integrations.id, { onDelete: 'cascade' }),

  /** 'pending' | 'publishing' | 'published' | 'failed' | 'skipped'. */
  status: text('status').notNull().default('pending'),

  /** External id of the published post (FB post id, tweet id, etc.) — set
   *  once status='published'. */
  externalId: text('external_id'),
  externalUrl: text('external_url'),

  publishedAt: timestamp('published_at', { withTimezone: true }),
  lastError: text('last_error'),
  attempts: integer('attempts').notNull().default(0),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  itemIntegrationIdx: uniqueIndex('content_targets_item_integration_idx').on(t.contentItemId, t.integrationId),
  itemIdx: index('content_targets_item_idx').on(t.contentItemId),
  statusIdx: index('content_targets_status_idx').on(t.status),
}));

export const generationRuns = pgTable('generation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),

  /** Higher-level 'prompt template' the operator chose. */
  template: text('template'),
  /** The exact prompt sent. */
  prompt: text('prompt').notNull(),
  /** Provider response (raw). */
  response: text('response'),

  model: text('model'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costCents: integer('cost_cents'),

  status: text('status').notNull().default('pending'),
  error: text('error'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientIdx: index('generation_runs_client_idx').on(t.clientId),
  createdIdx: index('generation_runs_created_idx').on(t.createdAt),
}));

/* ──────────────────────────────────────────────────────────────────────────
   Jobs + audit log
   ────────────────────────────────────────────────────────────────────────── */

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),

  kind: text('kind').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

  /** 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'. */
  status: text('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),

  runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  runAtIdx: index('jobs_run_at_idx').on(t.runAt),
  statusIdx: index('jobs_status_idx').on(t.status),
  kindIdx: index('jobs_kind_idx').on(t.kind),
}));

/* ──────────────────────────────────────────────────────────────────────────
   Metrics — channel + content engagement
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Account-level snapshot per channel — followers, total posts, etc.
 * Snapshots are append-only so we can chart growth over time.
 */
export const channelMetrics = pgTable('channel_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  integrationId: uuid('integration_id').notNull().references(() => integrations.id, { onDelete: 'cascade' }),

  /** Followers / page-likes / subscribers, depending on channel. */
  followers: integer('followers'),
  /** Total posts/tweets/videos on the connected account at snapshot time. */
  posts: integer('posts'),

  /** Channel-specific extras, kept open-ended. */
  extra: jsonb('extra').$type<Record<string, number | string | null>>().notNull().default(sql`'{}'::jsonb`),

  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  integrationIdx: index('channel_metrics_integration_idx').on(t.integrationId),
  fetchedIdx: index('channel_metrics_fetched_idx').on(t.fetchedAt),
}));

/**
 * Per-content engagement — one row per (content_target, fetch). Append-only
 * so we can chart engagement over the post's lifetime.
 */
export const contentMetrics = pgTable('content_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentTargetId: uuid('content_target_id').notNull().references(() => contentTargets.id, { onDelete: 'cascade' }),

  /** Channel-agnostic engagement axes — null when not applicable. */
  impressions: integer('impressions'),
  likes: integer('likes'),
  comments: integer('comments'),
  shares: integer('shares'),
  clicks: integer('clicks'),
  views: integer('views'),

  /** Anything channel-specific (e.g. retweets vs quote-tweets). */
  extra: jsonb('extra').$type<Record<string, number | string | null>>().notNull().default(sql`'{}'::jsonb`),

  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  targetIdx: index('content_metrics_target_idx').on(t.contentTargetId),
  fetchedIdx: index('content_metrics_fetched_idx').on(t.fetchedAt),
}));

/* ──────────────────────────────────────────────────────────────────────────
   SEO — per-client profile + on-page audit history
   ────────────────────────────────────────────────────────────────────────── */

/**
 * One row per client. Holds the SEO knobs the operator hand-curates and
 * the engine uses (a) when generating content, and (b) when ranking
 * audit findings. Kept as a table (rather than `clients.settings.seo`)
 * so we can index target_keywords + run cross-client reports.
 */
export const seoProfiles = pgTable('seo_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),

  /** Canonical URL of the client's site — we audit this. */
  siteUrl: text('site_url'),

  /** Primary geo target — e.g. "Phoenix, AZ" — surfaced in local pack reports. */
  primaryLocation: text('primary_location'),

  /** Target keywords the client wants to rank for. UI is one-per-line; we
   *  store as a flat array for cheap reads + indexability. */
  targetKeywords: jsonb('target_keywords').$type<string[]>().notNull().default(sql`'[]'::jsonb`),

  /** Optional schema-org overrides (LocalBusiness, AutoDealer, etc.). */
  schemaType: text('schema_type'),

  /** Free-form notes from the operator. */
  notes: text('notes'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientIdx: uniqueIndex('seo_profiles_client_idx').on(t.clientId),
}));

/**
 * One row per audit run. `findings` is an array of issue objects so the
 * UI can render a checklist; `score` is the aggregate (0–100) for the
 * dashboard's at-a-glance bar.
 *
 * We keep history so improvement-over-time is visible. Rows are
 * append-only; nothing edits an existing audit.
 */
export const seoAudits = pgTable('seo_audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),

  /** What URL was audited. Mirrors seo_profiles.site_url at run time. */
  url: text('url').notNull(),

  /** Aggregate 0–100. */
  score: integer('score').notNull().default(0),

  /** Array of `{ id, severity, title, detail, hint? }`. */
  findings: jsonb('findings').$type<Array<{
    id: string;
    severity: 'info' | 'warn' | 'fail';
    title: string;
    detail?: string;
    hint?: string;
  }>>().notNull().default(sql`'[]'::jsonb`),

  /** Captured snapshot for debugging — title, h1s, meta description. */
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

  status: text('status').notNull().default('completed'),
  error: text('error'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientIdx: index('seo_audits_client_idx').on(t.clientId),
  createdIdx: index('seo_audits_created_idx').on(t.createdAt),
}));

/* ──────────────────────────────────────────────────────────────────────────
   Audit log (the existing append-only mutation history)
   ────────────────────────────────────────────────────────────────────────── */

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** 'client.imported', 'integration.connected', 'content.generated', … */
  event: text('event').notNull(),

  /** Best-effort actor. 'system' for cron, 'operator' for in-app actions. */
  actor: text('actor').notNull().default('system'),

  targetType: text('target_type'),
  targetId: text('target_id'),

  /** Free-form details. Keep readable JSON; don't store huge blobs. */
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  eventIdx: index('audit_log_event_idx').on(t.event),
  createdIdx: index('audit_log_created_idx').on(t.createdAt),
  targetIdx: index('audit_log_target_idx').on(t.targetType, t.targetId),
}));
