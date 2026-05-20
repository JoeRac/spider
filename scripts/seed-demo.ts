/**
 * Demo seed — populates a believable cross-section of Spider data so the
 * UI has something to render before real OAuth apps + Badger imports
 * are wired up.
 *
 * Idempotent: every row this script writes is tagged either via
 * `clients.tags` containing 'demo' or descends from a demo client via
 * the existing FK cascades. Re-running deletes the previous demo set
 * and recreates it.
 *
 * Run:
 *   npm run seed:demo
 */
import { db } from '../lib/db/index';
import {
  clients, integrations, contentItems, contentTargets, generationRuns,
  channelMetrics, contentMetrics,
  seoProfiles, seoAudits, seoCitations, seoSitemaps, seoIndexPings,
  auditLog,
  type Channel,
} from '../lib/db/schema';
import { sql, eq, inArray } from 'drizzle-orm';
import { encryptJSON } from '../lib/crypto';
import { CITATION_DIRECTORIES } from '../lib/seo/citations';

type DemoIntegration = {
  channel: Channel;
  externalIds: Record<string, string>;
  credentials: Record<string, unknown>;
};

type DemoContent = {
  kind: 'post' | 'article' | 'tweet' | 'video_desc' | 'reply';
  title?: string;
  body: string;
  status: 'draft' | 'scheduled' | 'published';
  scheduledIn?: { hours: number } | { days: number };
  variants?: Record<string, string>;
  channels?: Channel[];
  metrics?: Partial<{ impressions: number; likes: number; comments: number; shares: number; views: number; clicks: number }>;
  mediaUrls?: string[];
};

type DemoClient = {
  name: string;
  website: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  postcode: string;
  description: string;
  status: 'active' | 'onboarding';
  voice: {
    niche: string;
    tone: string;
    audience: string;
    sellingPoints: string[];
    avoid?: string[];
    callToAction?: string;
  };
  seo?: {
    primaryLocation: string;
    targetKeywords: string[];
    schemaType: string;
  };
  integrations: DemoIntegration[];
  content: DemoContent[];
  citationsComplete?: string[];
  citationsPartial?: string[];
  sitemapSnapshots?: number[];
};

const DEMO: DemoClient[] = [
  {
    name: 'Phoenix Truck Mart',
    website: 'https://phoenixtruckmart.example.com',
    phone: '+16025551001',
    email: 'sales@phoenixtruckmart.example.com',
    city: 'Phoenix', state: 'AZ', postcode: '85003',
    description: 'Independent used-car dealership in central Phoenix, specialising in pre-owned trucks, SUVs, and 4x4s for working families.',
    status: 'active',
    voice: {
      niche: 'Independent used-truck specialist',
      tone: 'Friendly, direct, no jargon',
      audience: 'Working families and tradespeople in the Phoenix metro',
      sellingPoints: ['On-site financing', 'CarFax on every vehicle', 'Family-owned since 2003', '7-day exchange guarantee'],
      avoid: ['Pushy sales language', 'Fake urgency'],
      callToAction: 'Stop by the lot — we\'re open till 8pm.',
    },
    seo: {
      primaryLocation: 'Phoenix, AZ',
      targetKeywords: ['used trucks phoenix', 'best used car dealership phoenix', '4x4 financing arizona', 'pre-owned ford f-150 phoenix'],
      schemaType: 'AutoDealer',
    },
    integrations: [
      { channel: 'google_my_business', externalIds: { account_id: 'accounts/demo-pmt-001', account_name: 'Phoenix Truck Mart' }, credentials: { access_token: 'demo', refresh_token: 'demo' } },
      { channel: 'facebook',           externalIds: { page_id: '101010101010101', page_name: 'Phoenix Truck Mart' }, credentials: { page_access_token: 'demo', user_access_token: 'demo' } },
      { channel: 'twitter',            externalIds: { user_id: '1234567890', username: 'phxtruckmart' }, credentials: { access_token: 'demo', refresh_token: 'demo' } },
      { channel: 'instagram',          externalIds: { instagram_account_id: '17841400000000001', page_id: '101010101010101', page_name: 'Phoenix Truck Mart' }, credentials: { page_access_token: 'demo' } },
      { channel: 'website_blog',       externalIds: { webhook_url: 'https://phoenixtruckmart.example.com/spider-hook' }, credentials: { mode: 'webhook', url: 'https://phoenixtruckmart.example.com/spider-hook', secret: 'demo-secret' } },
    ],
    content: [
      {
        kind: 'post',
        title: 'New arrival — 2019 Ford F-150 Lariat',
        body: 'Just rolled onto the lot: a 2019 F-150 Lariat with 68k miles, one owner, full service history. Loaded with the FX4 off-road package and the 5.0L V8. Stop by this weekend if you\'ve been waiting for the right one.',
        status: 'published',
        channels: ['google_my_business', 'facebook'],
        metrics: { impressions: 1840, likes: 47, comments: 6, shares: 12 },
        variants: {
          google_my_business: 'New arrival: 2019 Ford F-150 Lariat. 68k miles, one owner, FX4 off-road package, 5.0L V8. Open till 8pm.',
          facebook: 'Just rolled onto the lot: a 2019 F-150 Lariat with 68k miles, one owner, full service history. FX4 off-road, 5.0L V8 — this one won\'t sit long. Come kick the tires this weekend!',
        },
      },
      {
        kind: 'tweet',
        body: 'Used trucks in Phoenix that won\'t eat your weekend. CarFax on every vehicle, financing on the spot, 7-day exchange. We\'re open till 8.',
        status: 'published',
        channels: ['twitter'],
        metrics: { impressions: 2310, likes: 19, comments: 2, shares: 5 },
      },
      {
        kind: 'article',
        title: '4x4 financing in Arizona: a no-nonsense guide for first-time buyers',
        body: '## Why financing a 4x4 in Arizona is different\n\nThe summer heat is hard on every vehicle here, and 4x4 buyers have specific priorities — cooling systems that handle 115°F days, suspension built for washboard roads, and a payment structure that doesn\'t buckle if a hailstorm cracks a windshield.\n\n## What lenders actually look at\n\n1. Credit score (but not as much as you think)\n2. Down payment percentage\n3. Vehicle age vs loan term\n\n## Our approach\n\nWe work with seven local lenders and one credit union, so most buyers walk out with a payment that fits the same day...',
        status: 'published',
        channels: ['website_blog'],
        metrics: { impressions: 420, likes: 8, clicks: 67 },
      },
      {
        kind: 'post',
        body: 'Tip of the week: in Phoenix heat, your tires lose ~1 PSI per 10°F drop overnight. Check pressure on cool mornings, not after a long drive.',
        status: 'scheduled',
        scheduledIn: { hours: 18 },
        channels: ['google_my_business', 'facebook', 'twitter'],
      },
      {
        kind: 'tweet',
        body: 'Truck of the week: 2017 Tacoma TRD Off-Road, 82k miles, locking rear diff, factory skid plates. Built for the desert. Come look.',
        status: 'scheduled',
        scheduledIn: { hours: 28 },
        channels: ['twitter'],
      },
      {
        kind: 'post',
        body: 'Just-in: 2020 Chevy Silverado 1500 LT Trail Boss. 54k miles, Z71 package. Photos going up tonight.',
        status: 'draft',
      },
      {
        kind: 'article',
        title: 'Buying a used 4x4 in Phoenix: 5 things the dealer should tell you (but usually doesn\'t)',
        body: '## What to ask before you put any money down\n\n1. Frame inspection — was this truck ever driven on salted roads?\n2. AC service history — this is Phoenix, not Portland.\n3. Differential service intervals — especially on 4x4s.\n4. Suspension wear — desert washboards are brutal.\n5. Tire age vs tread depth.\n\nWe\'ll walk you through all five on every truck on the lot.',
        status: 'draft',
      },
    ],
    citationsComplete: ['google_business', 'bing_places', 'apple_maps', 'facebook_page', 'yelp', 'cars_com', 'autotrader'],
    citationsPartial: ['better_business_bureau', 'cargurus', 'foursquare'],
    sitemapSnapshots: [42, 44, 46, 48, 51],
  },
  {
    name: 'Sunset Auto Group',
    website: 'https://sunsetautogroup.example.com',
    phone: '+16195552002',
    email: 'hello@sunsetautogroup.example.com',
    city: 'San Diego', state: 'CA', postcode: '92101',
    description: 'Family-owned used-car dealership in San Diego serving North Park, South Park, and downtown buyers since 1998.',
    status: 'active',
    voice: {
      niche: 'Family-focused used car dealership',
      tone: 'Warm, neighbourly, conversational',
      audience: 'San Diego families upgrading from a first car or trading up after a milestone',
      sellingPoints: ['25 years in the neighbourhood', 'Spanish + English on the lot', 'Bilingual financing team', 'Free CarFax + 90-day powertrain'],
      callToAction: 'Drop by — coffee\'s always on.',
    },
    seo: {
      primaryLocation: 'San Diego, CA',
      targetKeywords: ['used cars san diego', 'family suv san diego', 'bilingual car dealer san diego'],
      schemaType: 'AutoDealer',
    },
    integrations: [
      { channel: 'google_my_business', externalIds: { account_id: 'accounts/demo-sag-001', account_name: 'Sunset Auto Group' }, credentials: { access_token: 'demo', refresh_token: 'demo' } },
      { channel: 'facebook',           externalIds: { page_id: '202020202020202', page_name: 'Sunset Auto Group' }, credentials: { page_access_token: 'demo', user_access_token: 'demo' } },
      { channel: 'instagram',          externalIds: { instagram_account_id: '17841400000000002', page_id: '202020202020202' }, credentials: { page_access_token: 'demo' } },
      { channel: 'youtube',            externalIds: { channel_id: 'UCdemoSAG002', channel_title: 'Sunset Auto Group' }, credentials: { access_token: 'demo', refresh_token: 'demo' } },
    ],
    content: [
      {
        kind: 'post',
        title: 'Welcome, the Morales family',
        body: 'The Morales family drove off in their new-to-them 2018 Honda Pilot today — third car they\'ve bought from us across two generations. Stories like this are why we keep the lights on.',
        status: 'published',
        channels: ['google_my_business', 'facebook', 'instagram'],
        metrics: { impressions: 4120, likes: 188, comments: 24, shares: 31 },
      },
      {
        kind: 'video_desc',
        title: 'Walkaround: 2020 Toyota RAV4 XLE Premium',
        body: 'A full 7-minute walkaround of our 2020 RAV4 XLE Premium with 47k miles. Single owner, dealer-serviced from new, panoramic moonroof, power liftgate, the works.\n\n00:00 Intro\n00:35 Exterior + paint condition\n02:10 Interior + tech\n04:00 Engine bay + service history\n05:30 Test drive impressions\n06:40 Pricing + financing options\n\n#UsedCar #ToyotaRAV4 #SanDiego #UsedCars',
        status: 'published',
        channels: ['youtube'],
        metrics: { views: 1240, likes: 38, comments: 7 },
      },
      {
        kind: 'post',
        body: 'Family pro tip: third-row seats sound great until you try to install three car seats. Come by — we\'ll walk you through which SUVs actually work for your setup.',
        status: 'published',
        channels: ['facebook', 'instagram'],
        metrics: { impressions: 2860, likes: 102, comments: 18, shares: 14 },
      },
      {
        kind: 'post',
        body: 'Open this Saturday 9–6. Spring weekend special: we\'ll pay your DMV fees on any vehicle over $15k.',
        status: 'scheduled',
        scheduledIn: { days: 2 },
        channels: ['google_my_business', 'facebook', 'instagram'],
      },
      {
        kind: 'post',
        body: 'New on the lot: 2019 Mazda CX-5 Touring, AWD, 51k miles. Photos coming this afternoon.',
        status: 'draft',
      },
    ],
    citationsComplete: ['google_business', 'bing_places', 'apple_maps', 'facebook_page', 'yelp'],
    citationsPartial: ['cars_com', 'autotrader', 'cargurus', 'foursquare'],
    sitemapSnapshots: [28, 30, 31, 33],
  },
  {
    name: 'Mountain View Motors',
    website: 'https://mountainviewmotors.example.com',
    phone: '+13035553003',
    email: 'crew@mountainviewmotors.example.com',
    city: 'Denver', state: 'CO', postcode: '80205',
    description: 'Denver\'s 4x4 + adventure-vehicle specialist. Pre-owned Jeeps, 4Runners, Subarus, and built-out overland rigs.',
    status: 'active',
    voice: {
      niche: '4x4 + adventure / overland vehicle specialist',
      tone: 'Rugged, knowledgeable, gear-head friendly',
      audience: 'Colorado outdoors enthusiasts — climbers, skiers, weekend overlanders',
      sellingPoints: ['Every rig pre-checked by our in-house wrench', '4x4 trade-ins welcome', 'Roof rack + overhead tent install discounts', 'Sponsor of Tread Lightly! Colorado chapter'],
      callToAction: 'Come kick the dirt off it.',
    },
    seo: {
      primaryLocation: 'Denver, CO',
      targetKeywords: ['used jeep denver', 'overland vehicle colorado', '4runner for sale denver', 'subaru outback used denver'],
      schemaType: 'AutoDealer',
    },
    integrations: [
      { channel: 'google_my_business', externalIds: { account_id: 'accounts/demo-mvm-001', account_name: 'Mountain View Motors' }, credentials: { access_token: 'demo', refresh_token: 'demo' } },
      { channel: 'twitter',            externalIds: { user_id: '3030303030', username: 'mvmotorsCO' }, credentials: { access_token: 'demo', refresh_token: 'demo' } },
      { channel: 'youtube',            externalIds: { channel_id: 'UCdemoMVM003', channel_title: 'Mountain View Motors' }, credentials: { access_token: 'demo', refresh_token: 'demo' } },
      { channel: 'linkedin',           externalIds: { member_urn: 'urn:li:person:demo-mvm-003', member_name: 'Mountain View Motors' }, credentials: { access_token: 'demo' } },
      { channel: 'tiktok',             externalIds: { open_id: 'demo-mvm-003-tt' }, credentials: { access_token: 'demo', refresh_token: 'demo' } },
    ],
    content: [
      {
        kind: 'video_desc',
        title: 'Built 2018 4Runner TRD Off-Road Premium — full overland setup',
        body: 'This 4Runner just landed and it\'s the kind of build we love seeing come through. Stock TRD Off-Road Premium with a tasteful set of mods that don\'t void anything.\n\nWhat\'s on it:\n- ARB Old Man Emu 2" lift\n- 285/70R17 BFG KO2s\n- Rear sliders, front bumper plates\n- Yakima SkyRise tent + crossbars\n- Factory KDSS still intact\n\n00:00 Walkaround\n02:30 Suspension dive\n04:15 Drive impressions on dirt\n05:50 Pricing + what\'s next\n\n#4Runner #Overland #UsedCar #Denver',
        status: 'published',
        channels: ['youtube'],
        metrics: { views: 8420, likes: 312, comments: 41 },
      },
      {
        kind: 'tweet',
        body: 'Built 2018 4Runner TRD Off-Road Premium. ARB OME lift, 285 KO2s, sliders, factory KDSS intact, rooftop tent. Photos + pricing tomorrow.',
        status: 'published',
        channels: ['twitter'],
        metrics: { impressions: 5210, likes: 142, comments: 18, shares: 56 },
      },
      {
        kind: 'post',
        body: 'Trail report: Buffalo Pass is officially open. We took the loaner 4Runner up Friday — minor washouts past mile 4, otherwise smooth. Conditions update with photos in our story.',
        status: 'published',
        channels: ['google_my_business'],
        metrics: { impressions: 1280, likes: 24, comments: 3 },
      },
      {
        kind: 'tweet',
        body: 'Tip: if you\'re shopping a used 4x4 in Denver, look for the differential breather extension. If it\'s aftermarket, the previous owner took water seriously. That\'s a good sign.',
        status: 'scheduled',
        scheduledIn: { hours: 6 },
        channels: ['twitter'],
      },
      {
        kind: 'post',
        body: 'New rig: 2019 Subaru Outback Wilderness with 39k miles. Roof rack already installed. Coffee + walkaround Saturday morning.',
        status: 'draft',
      },
    ],
    citationsComplete: ['google_business', 'bing_places', 'apple_maps', 'facebook_page', 'yelp', 'cargurus'],
    citationsPartial: ['cars_com', 'autotrader'],
    sitemapSnapshots: [19, 22, 24],
  },
  {
    name: 'Lone Star Pickups',
    website: 'https://lonestarpickups.example.com',
    phone: '+15125554004',
    email: 'howdy@lonestarpickups.example.com',
    city: 'Austin', state: 'TX', postcode: '78704',
    description: 'Austin-area pickup-truck dealership. Half-tons, three-quarter tons, and the occasional clean SUV.',
    status: 'active',
    voice: {
      niche: 'Pickup-truck and SUV dealership',
      tone: 'Texas-friendly, plainspoken, a little proud',
      audience: 'Texas truck buyers — contractors, ranchers, weekend cowboys, and city drivers who want the bed',
      sellingPoints: ['Tow-package inspections on every truck', 'No-haggle pricing', 'On-site tinting + bed liner shop', 'Open Saturday'],
      callToAction: 'Y\'all come by.',
    },
    seo: {
      primaryLocation: 'Austin, TX',
      targetKeywords: ['used pickup austin', 'used silverado austin', 'used f-250 texas', 'ram 1500 used austin'],
      schemaType: 'AutoDealer',
    },
    integrations: [
      { channel: 'google_my_business', externalIds: { account_id: 'accounts/demo-lsp-001', account_name: 'Lone Star Pickups' }, credentials: { access_token: 'demo', refresh_token: 'demo' } },
      { channel: 'facebook',           externalIds: { page_id: '404040404040404', page_name: 'Lone Star Pickups' }, credentials: { page_access_token: 'demo', user_access_token: 'demo' } },
      { channel: 'twitter',            externalIds: { user_id: '4040404040', username: 'lonestarpickups' }, credentials: { access_token: 'demo', refresh_token: 'demo' } },
      { channel: 'website_blog',       externalIds: { base_url: 'https://lonestarpickups.example.com' }, credentials: { mode: 'wordpress', baseUrl: 'https://lonestarpickups.example.com', username: 'spider-bot', applicationPassword: 'demo-app-password' } },
    ],
    content: [
      {
        kind: 'post',
        body: 'On the lot today: 2021 Ram 1500 Big Horn with the 5.7 Hemi, 36k miles, factory crew cab. Tow package, spray-in bed liner, no haggle $34,400.',
        status: 'published',
        channels: ['google_my_business', 'facebook', 'twitter'],
        metrics: { impressions: 3450, likes: 88, comments: 11, shares: 19 },
      },
      {
        kind: 'article',
        title: 'Tow rating reality check: what your half-ton can actually pull in Texas heat',
        body: '## Sticker tow numbers vs. summer reality\n\nManufacturer tow ratings assume sea-level air, 70°F, a level grade, and one driver. In Austin in July, you\'re operating at about 75% of that number once the AC kicks in and the temperature passes 95°F.\n\n## The 75% rule\n\nMultiply the sticker rating by 0.75. That\'s your real working tow capacity in Central Texas summer. If you\'re pulling a 7,500lb trailer with a truck rated for 9,500lb, you\'re actually right at the edge.\n\n## What to look for in a used tow rig\n\n1. Transmission cooler upgrade — non-negotiable.\n2. Brake controller pre-wired.\n3. Receiver hitch class IV minimum.\n4. Mirrors with manual extension.\n5. Heavy-duty front + rear sway bars.\n\nEvery truck on our lot gets a tow-package inspection. We\'ll mark the actual working capacity right on the window sticker.',
        status: 'published',
        channels: ['website_blog'],
        metrics: { impressions: 680, clicks: 122 },
      },
      {
        kind: 'tweet',
        body: 'Half-ton tow ratings are summer-soft in Texas. Multiply the sticker by 0.75 and that\'s your real working capacity. Walk through the math with us anytime.',
        status: 'published',
        channels: ['twitter'],
        metrics: { impressions: 1810, likes: 39, comments: 5, shares: 12 },
      },
      {
        kind: 'post',
        body: 'Heads up: bed liner + tint shop running a 15% combo discount this week with any pickup over $20k.',
        status: 'scheduled',
        scheduledIn: { hours: 36 },
        channels: ['google_my_business', 'facebook'],
      },
      {
        kind: 'post',
        body: '2018 F-250 Super Duty Lariat just landed — 6.7 Powerstroke, 78k miles, gooseneck-prepped. Photos tonight.',
        status: 'draft',
      },
    ],
    citationsComplete: ['google_business', 'bing_places', 'facebook_page', 'cars_com'],
    citationsPartial: ['yelp', 'autotrader', 'cargurus', 'foursquare', 'nextdoor'],
    sitemapSnapshots: [33, 35, 37, 38],
  },
  {
    name: 'Bayside Imports',
    website: 'https://baysideimports.example.com',
    phone: '+18135552005',
    email: 'concierge@baysideimports.example.com',
    city: 'Tampa', state: 'FL', postcode: '33602',
    description: 'Boutique used-luxury and European-import dealership on the Tampa bayfront. Sport coupes, executive sedans, and the occasional left-hand-drive Defender.',
    status: 'onboarding',
    voice: {
      niche: 'Boutique luxury and European-import dealership',
      tone: 'Polished, understated, knowledgeable',
      audience: 'Tampa Bay professionals upgrading from a daily into a weekend car',
      sellingPoints: ['Concierge buying experience', 'Pre-purchase inspection at the marque\'s authorised service shop', 'Mostly one-owner, dealer-serviced cars'],
      callToAction: 'Schedule a private viewing.',
    },
    seo: {
      primaryLocation: 'Tampa, FL',
      targetKeywords: ['used porsche tampa', 'used mercedes s-class florida', 'used range rover tampa', 'used bmw m3 tampa'],
      schemaType: 'AutoDealer',
    },
    integrations: [],
    content: [],
    citationsComplete: ['google_business'],
    citationsPartial: ['facebook_page', 'apple_maps'],
    sitemapSnapshots: [11, 12, 12],
  },
];

async function main() {
  console.log('▸ wiping previous demo data (tag=demo)…');
  const previousDemo = await db.select({ id: clients.id }).from(clients)
    .where(sql`${clients.tags}::jsonb @> '["demo"]'::jsonb`);
  if (previousDemo.length) {
    await db.delete(clients).where(inArray(clients.id, previousDemo.map((r) => r.id)));
    console.log(`  removed ${previousDemo.length} prior demo client(s) (cascades wiped children)`);
  }

  // Pre-compute a stable badger_company_id namespace per demo client so
  // re-running outside this script (e.g. importing real Badger data) won't
  // conflict.
  const namespace = '00000000-dead-beef-cafe';

  for (let i = 0; i < DEMO.length; i++) {
    const demo = DEMO[i]!;
    const tag = `${namespace}-${String(i).padStart(12, '0')}`;
    console.log(`▸ seeding ${demo.name}…`);

    const [client] = await db.insert(clients).values({
      leadId: tag,
      badgerCompanyId: tag,
      name: demo.name,
      website: demo.website,
      phone: demo.phone,
      email: demo.email,
      addressCity: demo.city,
      addressState: demo.state,
      addressPostcode: demo.postcode,
      addressCountry: 'US',
      description: demo.description,
      status: demo.status,
      tags: ['demo'],
      settings: { voice: demo.voice },
    }).returning();
    if (!client) continue;

    // SEO profile + initial audit + sitemap snapshots
    if (demo.seo) {
      await db.insert(seoProfiles).values({
        clientId: client.id,
        siteUrl: demo.website,
        primaryLocation: demo.seo.primaryLocation,
        targetKeywords: demo.seo.targetKeywords,
        schemaType: demo.seo.schemaType,
      });
      const fakeFindings = sampleSeoFindings(demo.status === 'onboarding');
      await db.insert(seoAudits).values({
        clientId: client.id,
        url: demo.website,
        score: demo.status === 'onboarding' ? 58 : 78 + (i % 3) * 4,
        findings: fakeFindings,
        snapshot: { title: `${demo.name} — Used Cars in ${demo.city}`, h1Count: 1, metaDescription: `Quality used vehicles in ${demo.city}, ${demo.state}.`, hasSchemaOrg: demo.status !== 'onboarding' },
      });
    }

    // Sitemap snapshots — chronological
    if (demo.sitemapSnapshots) {
      for (let s = 0; s < demo.sitemapSnapshots.length; s++) {
        const daysAgo = (demo.sitemapSnapshots.length - 1 - s);
        await db.insert(seoSitemaps).values({
          clientId: client.id,
          url: `${demo.website.replace(/\/$/, '')}/sitemap.xml`,
          urlCount: demo.sitemapSnapshots[s]!,
          lastmodAt: daysAgo === 0 ? new Date(Date.now() - 86_400_000) : new Date(Date.now() - daysAgo * 7 * 86_400_000),
          status: 'completed',
          fetchedAt: new Date(Date.now() - daysAgo * 86_400_000),
        });
      }
    }

    // Citations — a third are complete, a third partial, rest missing
    if (demo.citationsComplete) {
      for (const key of demo.citationsComplete) {
        await db.insert(seoCitations).values({
          clientId: client.id,
          directoryKey: key,
          status: 'complete',
          url: `https://${key.replace('_', '-')}.example.com/listing/${tag}`,
          lastCheckedAt: new Date(),
        });
      }
    }
    if (demo.citationsPartial) {
      for (const key of demo.citationsPartial) {
        await db.insert(seoCitations).values({
          clientId: client.id,
          directoryKey: key,
          status: 'partial',
          url: `https://${key.replace('_', '-')}.example.com/listing/${tag}`,
          notes: 'NAP mismatch on phone number',
          lastCheckedAt: new Date(Date.now() - 5 * 86_400_000),
        });
      }
    }
    // Backfill some industry-irrelevant ones as N/A for non-auto-leaning clients
    if (demo.name === 'Bayside Imports') {
      for (const key of ['cars_com', 'autotrader', 'cargurus', 'edmunds']) {
        await db.insert(seoCitations).values({
          clientId: client.id, directoryKey: key, status: 'na', notes: 'Boutique luxury — uses concierge inquiries instead.',
        });
      }
    }

    // Integrations (only for non-onboarding clients).
    const integrationIdByChannel = new Map<Channel, string>();
    for (const int of demo.integrations) {
      const [row] = await db.insert(integrations).values({
        clientId: client.id,
        channel: int.channel,
        status: 'connected',
        externalIds: int.externalIds,
        credentials: { __ciphertext: encryptJSON({ ...int.credentials, expires_at: new Date(Date.now() + 6 * 30 * 86_400_000).toISOString() }) },
        lastSyncAt: new Date(Date.now() - Math.random() * 86_400_000),
      }).returning();
      if (!row) continue;
      integrationIdByChannel.set(int.channel, row.id);

      // Channel-level metrics snapshot
      await db.insert(channelMetrics).values({
        integrationId: row.id,
        followers: channelFollowersFor(int.channel, i),
        posts: 40 + i * 7,
        extra: int.channel === 'instagram' ? { username: int.externalIds.page_name ?? '' } : {},
      });
    }

    // Optional: one generation_run per active client to populate the
    // run history.
    let runId: string | null = null;
    if (demo.integrations.length > 0) {
      const [run] = await db.insert(generationRuns).values({
        clientId: client.id,
        template: 'post',
        prompt: `Generate a local post for ${demo.name} (${demo.city}, ${demo.state}).`,
        response: '{"items":[{"body":"…"}]}',
        model: 'glm-4.6',
        inputTokens: 540,
        outputTokens: 220,
        costCents: 1,
        status: 'completed',
      }).returning({ id: generationRuns.id });
      if (run) runId = run.id;
    }

    // Content items + targets + per-target metrics
    for (const c of demo.content) {
      const scheduledFor =
        c.scheduledIn && 'hours' in c.scheduledIn ? new Date(Date.now() + c.scheduledIn.hours * 3_600_000) :
        c.scheduledIn && 'days' in c.scheduledIn ? new Date(Date.now() + c.scheduledIn.days * 86_400_000) :
        null;

      const [item] = await db.insert(contentItems).values({
        clientId: client.id,
        kind: c.kind,
        title: c.title ?? null,
        body: c.body,
        status: c.status,
        scheduledFor,
        generationRunId: runId,
        mediaUrls: c.mediaUrls ?? [],
        metadata: {
          hashtags: [],
          variants: c.variants ?? undefined,
          notes: null,
        },
      }).returning({ id: contentItems.id });
      if (!item) continue;

      for (const channel of c.channels ?? []) {
        const integrationId = integrationIdByChannel.get(channel);
        if (!integrationId) continue;

        const externalId = c.status === 'published' ? `demo-${channel}-${item.id.slice(0, 8)}` : null;
        const externalUrl = c.status === 'published' ? fakeExternalUrl(channel, externalId!, demo) : null;

        const [target] = await db.insert(contentTargets).values({
          contentItemId: item.id,
          integrationId,
          status: c.status === 'published' ? 'published' : 'pending',
          externalId,
          externalUrl,
          publishedAt: c.status === 'published' ? new Date(Date.now() - Math.random() * 6 * 86_400_000) : null,
          attempts: c.status === 'published' ? 1 : 0,
        }).returning({ id: contentTargets.id });
        if (!target) continue;

        if (c.status === 'published' && c.metrics) {
          // Scatter slightly per channel so it's not identical numbers.
          const jitter = (n: number | undefined) => n != null ? Math.round(n * (0.7 + Math.random() * 0.6)) : null;
          await db.insert(contentMetrics).values({
            contentTargetId: target.id,
            impressions: jitter(c.metrics.impressions),
            likes: jitter(c.metrics.likes),
            comments: jitter(c.metrics.comments),
            shares: jitter(c.metrics.shares),
            clicks: jitter(c.metrics.clicks),
            views: jitter(c.metrics.views),
          });
        }
      }
    }

    // Audit log entry
    await db.insert(auditLog).values({
      event: 'client.imported',
      actor: 'demo-seed',
      targetType: 'client',
      targetId: client.id,
      payload: { name: client.name },
    });
  }

  // IndexNow log + a couple of cross-cutting audit events.
  const someClients = await db.select({ id: clients.id, website: clients.website }).from(clients)
    .where(sql`${clients.tags}::jsonb @> '["demo"]'::jsonb`)
    .limit(3);
  for (const c of someClients) {
    if (!c.website) continue;
    await db.insert(seoIndexPings).values({
      clientId: c.id,
      url: `${c.website.replace(/\/$/, '')}/blog/used-truck-buying-guide-2026`,
      provider: 'indexnow',
      status: 'submitted',
      response: '202 Accepted',
    });
    await db.insert(auditLog).values({
      event: 'content.published',
      actor: 'system',
      targetType: 'client',
      targetId: c.id,
      payload: { channel: 'website_blog' },
    });
  }

  console.log('✓ demo seed complete.');
}

function sampleSeoFindings(weak: boolean) {
  return [
    { id: 'title-ok', severity: 'info' as const, title: 'Title length looks healthy', detail: '52 chars' },
    { id: 'meta-desc-ok', severity: 'info' as const, title: 'Meta description length is good' },
    ...(weak ? [
      { id: 'h1-missing', severity: 'fail' as const, title: 'No <h1> on the page', hint: 'Every page should have exactly one H1 stating its main topic.' },
      { id: 'schema-missing', severity: 'warn' as const, title: 'No JSON-LD schema detected', hint: 'Add AutoDealer / LocalBusiness structured data.' },
      { id: 'img-alt', severity: 'warn' as const, title: '8 images missing alt text' },
    ] : [
      { id: 'img-alt', severity: 'warn' as const, title: '3 images missing alt text' },
      { id: 'internal-links-low', severity: 'warn' as const, title: 'Only 4 internal links', hint: 'Internal links spread authority and help crawlers map your site.' },
    ]),
  ];
}

function channelFollowersFor(channel: Channel, seed: number): number {
  const base: Record<string, number> = {
    google_my_business: 0,
    facebook: 1200 + seed * 340,
    twitter: 480 + seed * 120,
    instagram: 1850 + seed * 410,
    linkedin: 220 + seed * 80,
    youtube: 95 + seed * 50,
    tiktok: 760 + seed * 200,
    website_blog: 0,
  };
  return base[channel] ?? 0;
}

function fakeExternalUrl(channel: Channel, externalId: string, demo: DemoClient): string | null {
  switch (channel) {
    case 'twitter':            return `https://twitter.com/${demo.name.toLowerCase().replace(/\s+/g, '')}/status/${externalId}`;
    case 'facebook':           return `https://facebook.com/${externalId}`;
    case 'instagram':          return `https://instagram.com/p/${externalId}`;
    case 'linkedin':           return `https://www.linkedin.com/feed/update/urn:li:share:${externalId}`;
    case 'youtube':            return `https://www.youtube.com/watch?v=${externalId}`;
    case 'tiktok':             return `https://www.tiktok.com/@${demo.name.toLowerCase().replace(/\s+/g, '')}/video/${externalId}`;
    case 'website_blog':       return `${demo.website.replace(/\/$/, '')}/blog/${externalId}`;
    case 'google_my_business': return null; // GMB posts don't have a public shareable URL
    default: return null;
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});

// hush unused imports in the bundle
void eq;
