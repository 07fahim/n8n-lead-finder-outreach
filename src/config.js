// every fixed value of the lead finder lives here; build.js inlines this file at the top of each Code node
const { PRODUCT_NAME, TABLE_PREFIX } = require('./product');

const CITIES_PER_RUN = 4;
// 4 km around the centre and the server-side limits are the source document's values
const SEARCH_RADIUS_METRES = 4000;
const OVERPASS_SERVER_TIMEOUT_SECONDS = 170;
const OVERPASS_RESULT_LIMIT = 400;
const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
// measured 2026-11-16: busy servers recovered after minutes, so waits grow instead of the 5 s n8n retry allows
const OVERPASS_WAITS_SECONDS = [15, 45, 90];
// above the 170 s the server may spend on the query, so a slow but valid answer is not thrown away
const OVERPASS_REQUEST_TIMEOUT_SECONDS = 180;
// four cities at this budget fit in N8N_RUNNERS_TASK_TIMEOUT=2400 set in start-n8n.cmd
const OVERPASS_CITY_BUDGET_SECONDS = 420;
const OVERPASS_USER_AGENT = `${PRODUCT_NAME.replace(/\s+/g, '')}LeadFinder/1.0 (n8n)`;
// some salon sites refuse requests without a browser user agent
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// the source document's cap; measured yield is 20-50 per city, so it guards dense cities only
const MAX_LEADS_PER_RUN = 200;
// the 2026-11-16 probe loaded 39 of 46 sites with this timeout
const WEBSITE_TIMEOUT_SECONDS = 15;
// 8 at a time keeps 200 sites with action pages under about 13 minutes at the 15 s timeout
const WEBSITE_CONCURRENCY = 8;
// a city with fewer reachable businesses is flagged in the run report so it can be replaced
const THIN_CITY_THRESHOLD = 5;

// an action button can point at a redirect or link-in-bio service; the business uses some tool, but the service
// is not that tool (seen: qrfy.com on nails-c.test, 2026-11-16)
const REDIRECT_DOMAINS = ['qrfy.com', 'bit.ly', 'tinyurl.com', 'linktr.ee', 'linkin.bio', 'beacons.ai', 'paa.ge',
  'qr-code-generator.com', 'rebrand.ly', 't.co'];
// links to these are never a competitor's tool, even behind an action button
const NON_TOOL_DOMAINS = [
  'facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com', 'youtube.com',
  'youtu.be', 'linkedin.com', 'pinterest.com', 'google.com', 'goo.gl', 'g.page', 'apple.com', 'bing.com',
  'openstreetmap.org', 'yelp.com', 'yelp.co.uk', 'tripadvisor.com', 'tripadvisor.co.uk', 'trustpilot.com',
  'wa.me', 'whatsapp.com', 'nhs.uk', 'gov.uk', 'googletagmanager.com', 'doubleclick.net', 'vimeo.com', 'spotify.com',
];
// uk and other sites embed maps from google.co.uk and similar country domains
const GOOGLE_HOST = /(^|\.)google\.(com?\.)?[a-z]{2,3}$/;
// a footer credit link says "All rights reserved", and its "reserved" is not an action word
const RIGHTS_RESERVED = /rights\s+reserved/gi;
// an action button that opens the contact page is not a tool (seen: "Book an appointment" on dental-d)
const CONTACT_PATH = /contact/i;
const JUNK_EMAIL_PARTS = [
  'example.', 'sentry', 'wixpress', '@domain.com', '@email.com', 'yourname', 'yourdomain', 'yourcompany',
  'godaddy', '@2x',
];
// placeholder addresses are only junk when this is the whole part before the @ (salonname@ is real)
const JUNK_EMAIL_LOCAL_PARTS = ['name', 'user', 'test', 'email'];
const INSTAGRAM_NON_HANDLES = ['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'about', 'developer'];

const LEADS_TABLE = `${TABLE_PREFIX}_leads`;
const CITIES_TABLE = `${TABLE_PREFIX}_cities`;
const LEAD_COLUMNS = [
  { name: 'osm_key', type: 'string' },
  { name: 'name', type: 'string' },
  { name: 'category', type: 'string' },
  { name: 'country', type: 'string' },
  { name: 'city', type: 'string' },
  { name: 'tier', type: 'string' },
  { name: 'score', type: 'number' },
  { name: 'reasons', type: 'string' },
  { name: 'phone', type: 'string' },
  { name: 'email', type: 'string' },
  { name: 'whatsapp', type: 'string' },
  { name: 'instagram', type: 'string' },
  { name: 'website', type: 'string' },
  { name: 'tool_status', type: 'string' },
  { name: 'tool_name', type: 'string' },
  { name: 'address', type: 'string' },
  { name: 'maps_link', type: 'string' },
  { name: 'opener', type: 'string' },
  { name: 'status', type: 'string' },
  { name: 'date_found', type: 'date' },
];
const CITY_COLUMNS = [
  { name: 'city', type: 'string' },
  { name: 'country', type: 'string' },
  { name: 'lat', type: 'number' },
  { name: 'lon', type: 'number' },
  { name: 'list_order', type: 'number' },
  { name: 'last_run', type: 'date' },
  { name: 'last_status', type: 'string' },
  { name: 'last_leads', type: 'number' },
];

// outreach: the Google Sheet the owner ticks, and the email sent from Gmail
const SHEET_HEADERS = {
  name: 'Name', city: 'City', tier: 'Tier', score: 'Score', email: 'Lead email', phone: 'Contact number',
  opener: 'Opener', send: 'Send email', sentDate: 'Sent date', status: 'Status', leadId: 'Lead ID',
};
const LEAD_STATUS = { new: 'New', sent: 'Sent', replied: 'Replied', stopped: 'Stopped', bounced: 'Bounced' };
const SHEET_TAB = 'Leads';
// a new free Gmail account gets locked for bursts of cold mail; raise after 2-3 weeks without complaints
const DAILY_SEND_LIMIT = 15;
// a random pause between two emails, so the mailbox does not send in a machine-like burst
const SEND_WAIT_SECONDS = [60, 180];
// what counts as "don't email me again" in the new text of a reply; "stop" alone counts at the start or end of a
// line, because the footer asks people to reply "stop"
const STOP_WORDS = new RegExp([
  '^\\W*(please\\s+)?stop\\b',
  '\\bstop\\W*$',
  '\\bplease stop\\b',
  '\\bunsubscribe\\b',
  '\\bremove (me|us)\\b',
  '\\btake (me|us) off\\b',
  '\\bstop (emailing|sending|contacting)\\b',
  "\\b(do not|don['’]t) (email|contact|message)\\b",
].join('|'), 'im');
// one address only: a cell holding "a@x.com;b@y.com" would send one email to two people
const SINGLE_ADDRESS = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const BOUNCE_SENDER = /mailer-daemon|postmaster/i;
// where the quoted original starts in a reply from Gmail, Outlook and Apple Mail
const REPLY_QUOTE_START = /^On .+wrote:\s*$|^-{2,}\s*Original Message|^From: .*@.*$/im;

module.exports = {
  CITIES_PER_RUN, SEARCH_RADIUS_METRES, OVERPASS_SERVER_TIMEOUT_SECONDS, OVERPASS_RESULT_LIMIT, OVERPASS_SERVERS,
  OVERPASS_WAITS_SECONDS, OVERPASS_REQUEST_TIMEOUT_SECONDS, OVERPASS_CITY_BUDGET_SECONDS, OVERPASS_USER_AGENT,
  BROWSER_USER_AGENT, MAX_LEADS_PER_RUN, WEBSITE_TIMEOUT_SECONDS, WEBSITE_CONCURRENCY, THIN_CITY_THRESHOLD,
  REDIRECT_DOMAINS, NON_TOOL_DOMAINS, GOOGLE_HOST, RIGHTS_RESERVED, CONTACT_PATH, JUNK_EMAIL_PARTS,
  JUNK_EMAIL_LOCAL_PARTS, INSTAGRAM_NON_HANDLES, LEADS_TABLE, CITIES_TABLE, LEAD_COLUMNS, CITY_COLUMNS, SHEET_HEADERS,
  LEAD_STATUS, SHEET_TAB, DAILY_SEND_LIMIT, SEND_WAIT_SECONDS, STOP_WORDS, SINGLE_ADDRESS, BOUNCE_SENDER,
  REPLY_QUOTE_START,
};
