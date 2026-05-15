/**
 * Schema.org JSON-LD builder.
 *
 * Given a Spider client (plus its SEO profile when available), produce a
 * paste-ready JSON-LD block the operator can drop into the `<head>` of
 * the client's site. Schema markup is one of the highest-leverage,
 * lowest-effort SEO + GEO moves — search engines parse it directly for
 * rich-result eligibility, and LLM-search products use it as a
 * structured citation source.
 *
 * Two profile types we support out of the box:
 *
 *   - **LocalBusiness / AutoDealer**: full business-card markup with
 *     NAP, opening hours (placeholder), area served, sameAs links.
 *     Defaults to `AutoDealer` for the dealership use case, but the
 *     `schemaType` field on the SEO profile overrides — set
 *     `LocalBusiness`, `Restaurant`, `Hospital`, etc. and the right
 *     parent type slots in.
 *
 *   - **Organization** (fallback): when the operator hasn't picked a
 *     more specific type, we still emit the minimum useful block.
 *
 * Field-level decisions:
 *   - We omit fields that would be empty rather than emitting
 *     `null`/`""` because Google's rich-results validator flags those.
 *   - `sameAs` is built from the client's connected integrations'
 *     externalIds — your Facebook page URL, Twitter handle, etc. This
 *     is the easiest SEO/GEO win because LLMs love sameAs links for
 *     cross-source verification.
 */
import type { Client, Integration, Channel } from '@/lib/db/schema';

export type JsonLd = Record<string, unknown>;

type SeoProfileInput = {
  siteUrl: string | null;
  primaryLocation: string | null;
  targetKeywords: string[] | null;
  schemaType: string | null;
} | null;

export function buildClientJsonLd(
  client: Client,
  profile: SeoProfileInput,
  integrations: Integration[] = [],
): JsonLd {
  const schemaType = profile?.schemaType?.trim() || 'AutoDealer';
  const siteUrl = profile?.siteUrl?.trim() || client.website || undefined;

  const address = buildAddress(client);
  const sameAs = buildSameAs(integrations);
  const areaServed = profile?.primaryLocation?.trim()
    || [client.addressCity, client.addressState].filter(Boolean).join(', ')
    || undefined;

  const ld: JsonLd = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    'name': client.name,
  };
  if (siteUrl)            ld.url         = siteUrl;
  if (client.phone)       ld.telephone   = client.phone;
  if (client.email)       ld.email       = client.email;
  if (client.description) ld.description = client.description;
  if (address)            ld.address     = address;
  if (areaServed)         ld.areaServed  = areaServed;
  if (sameAs.length)      ld.sameAs      = sameAs;

  // Keywords — `keywords` is a recognised property on Organization /
  // LocalBusiness for SEO discovery. We comma-join per Google's convention.
  if (profile?.targetKeywords && profile.targetKeywords.length > 0) {
    ld.keywords = profile.targetKeywords.join(', ');
  }

  return ld;
}

function buildAddress(client: Client): JsonLd | null {
  const hasAny =
    client.addressStreet || client.addressCity || client.addressState ||
    client.addressPostcode || client.addressCountry;
  if (!hasAny) return null;
  const a: JsonLd = { '@type': 'PostalAddress' };
  if (client.addressStreet)   a.streetAddress    = client.addressStreet;
  if (client.addressCity)     a.addressLocality  = client.addressCity;
  if (client.addressState)    a.addressRegion    = client.addressState;
  if (client.addressPostcode) a.postalCode       = client.addressPostcode;
  if (client.addressCountry)  a.addressCountry   = client.addressCountry;
  return a;
}

function buildSameAs(integrations: Integration[]): string[] {
  const out: string[] = [];
  for (const i of integrations) {
    if (i.status !== 'connected') continue;
    const url = canonicalProfileUrl(i.channel as Channel, i.externalIds as Record<string, string>);
    if (url) out.push(url);
  }
  return out;
}

function canonicalProfileUrl(channel: Channel, ids: Record<string, string>): string | null {
  switch (channel) {
    case 'twitter':            return ids.username ? `https://twitter.com/${ids.username}` : null;
    case 'facebook':           return ids.page_id ? `https://www.facebook.com/${ids.page_id}` : null;
    case 'instagram':          return ids.username ? `https://www.instagram.com/${ids.username}` : null;
    case 'linkedin':           return ids.member_urn ? `https://www.linkedin.com/in/${ids.member_urn.split(':').pop()}` : null;
    case 'youtube':            return ids.channel_id ? `https://www.youtube.com/channel/${ids.channel_id}` : null;
    case 'tiktok':             return ids.open_id ? `https://www.tiktok.com/@${ids.open_id}` : null;
    case 'google_my_business': return null; // GMB doesn't expose a stable public URL via API
    case 'website_blog':       return ids.base_url ?? null;
    default:                   return null;
  }
}

export function jsonLdToScriptTag(ld: JsonLd): string {
  const json = JSON.stringify(ld, null, 2);
  return `<script type="application/ld+json">\n${json}\n</script>`;
}
