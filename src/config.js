// every fixed value of the lead finder lives here; build.js inlines this file at the top of each Code node

// drafted 2026-11-16 and approved with the spec; centre coordinates are from memory and not checked, the run
// report flags any city that turns out thin
const CITIES = [
  { city: 'Nashville', country: 'US', lat: 36.1627, lon: -86.7816 },
  { city: 'Charlotte', country: 'US', lat: 35.2271, lon: -80.8431 },
  { city: 'Tampa', country: 'US', lat: 27.9506, lon: -82.4572 },
  { city: 'Las Vegas', country: 'US', lat: 36.1699, lon: -115.1398 },
  { city: 'Manchester', country: 'UK', lat: 53.4808, lon: -2.2426 },
  { city: 'Dublin', country: 'IE', lat: 53.3498, lon: -6.2603 },
  { city: 'Melbourne', country: 'AU', lat: -37.8136, lon: 144.9631 },
  { city: 'Toronto', country: 'CA', lat: 43.6532, lon: -79.3832 },
  { city: 'Austin', country: 'US', lat: 30.2672, lon: -97.7431 },
  { city: 'Birmingham', country: 'UK', lat: 52.4862, lon: -1.8904 },
  { city: 'Sydney', country: 'AU', lat: -33.8688, lon: 151.2093 },
  { city: 'Vancouver', country: 'CA', lat: 49.2827, lon: -123.1207 },
  { city: 'Denver', country: 'US', lat: 39.7392, lon: -104.9903 },
  { city: 'Leeds', country: 'UK', lat: 53.8008, lon: -1.5491 },
  { city: 'Cork', country: 'IE', lat: 51.8985, lon: -8.4756 },
  { city: 'Brisbane', country: 'AU', lat: -27.4698, lon: 153.0251 },
  { city: 'Calgary', country: 'CA', lat: 51.0447, lon: -114.0719 },
  { city: 'Portland', country: 'US', lat: 45.5152, lon: -122.6784 },
  { city: 'Glasgow', country: 'UK', lat: 55.8642, lon: -4.2518 },
  { city: 'Perth', country: 'AU', lat: -31.9523, lon: 115.8613 },
  { city: 'Ottawa', country: 'CA', lat: 45.4215, lon: -75.6972 },
  { city: 'Minneapolis', country: 'US', lat: 44.9778, lon: -93.265 },
  { city: 'Edinburgh', country: 'UK', lat: 55.9533, lon: -3.1883 },
  { city: 'Galway', country: 'IE', lat: 53.2707, lon: -9.0568 },
  { city: 'Adelaide', country: 'AU', lat: -34.9285, lon: 138.6007 },
  { city: 'Edmonton', country: 'CA', lat: 53.5461, lon: -113.4938 },
  { city: 'Raleigh', country: 'US', lat: 35.7796, lon: -78.6382 },
  { city: 'Bristol', country: 'UK', lat: 51.4545, lon: -2.5879 },
  { city: 'Gold Coast', country: 'AU', lat: -28.0167, lon: 153.4 },
  { city: 'Winnipeg', country: 'CA', lat: 49.8951, lon: -97.1384 },
  { city: 'Columbus', country: 'US', lat: 39.9612, lon: -82.9988 },
  { city: 'Liverpool', country: 'UK', lat: 53.4084, lon: -2.9916 },
  { city: 'Limerick', country: 'IE', lat: 52.6638, lon: -8.6267 },
  { city: 'Canberra', country: 'AU', lat: -35.2809, lon: 149.13 },
  { city: 'Kansas City', country: 'US', lat: 39.0997, lon: -94.5786 },
  { city: 'Sheffield', country: 'UK', lat: 53.3811, lon: -1.4701 },
  { city: 'San Diego', country: 'US', lat: 32.7157, lon: -117.1611 },
  { city: 'Nottingham', country: 'UK', lat: 52.9548, lon: -1.1581 },
  { city: 'Salt Lake City', country: 'US', lat: 40.7608, lon: -111.891 },
  { city: 'Cardiff', country: 'UK', lat: 51.4816, lon: -3.1791 },
  { city: 'Pittsburgh', country: 'US', lat: 40.4406, lon: -79.9959 },
  { city: 'Newcastle', country: 'UK', lat: 54.9783, lon: -1.6178 },
  { city: 'Brighton', country: 'UK', lat: 50.8225, lon: -0.1372 },
];

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
const OVERPASS_USER_AGENT = 'AcmeBookLeadFinder/1.0 (n8n)';
// some salon sites refuse requests without a browser user agent
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// the source document's cap; measured yield is 20-50 per city, so it guards dense cities only
const MAX_LEADS_PER_RUN = 200;
// the 2026-11-16 probe loaded 39 of 46 sites with this timeout
const WEBSITE_TIMEOUT_SECONDS = 15;
// 8 at a time keeps 200 sites with booking pages under about 13 minutes at the 15 s timeout
const WEBSITE_CONCURRENCY = 8;
// a city with fewer reachable businesses is flagged in the run report so it can be replaced
const THIN_CITY_THRESHOLD = 5;

const CATEGORY_RULES = [
  { tagKey: 'shop', tagValue: 'hairdresser', category: 'Hair Salon' },
  { tagKey: 'shop', tagValue: 'beauty', category: 'Beauty Salon' },
  { tagKey: 'shop', tagValue: 'pet_grooming', category: 'Pet Groomer' },
  { tagKey: 'shop', tagValue: 'massage', category: 'Massage Studio' },
  { tagKey: 'shop', tagValue: 'tattoo', category: 'Tattoo Studio' },
  { tagKey: 'shop', tagValue: 'photo', category: 'Photography Studio' },
  { tagKey: 'amenity', tagValue: 'dentist', category: 'Dental Clinic' },
  { tagKey: 'amenity', tagValue: 'veterinary', category: 'Vet Clinic' },
  { tagKey: 'amenity', tagValue: 'driving_school', category: 'Driving School' },
  { tagKey: 'healthcare', tagValue: 'dentist', category: 'Dental Clinic' },
  { tagKey: 'healthcare', tagValue: 'physiotherapist', category: 'Physiotherapy Clinic' },
  { tagKey: 'healthcare', tagValue: 'chiropractor', category: 'Chiropractic Clinic' },
  { tagKey: 'healthcare', tagValue: 'psychotherapist', category: 'Therapy Practice' },
  { tagKey: 'leisure', tagValue: 'spa', category: 'Spa' },
  { tagKey: 'craft', tagValue: 'photographer', category: 'Photography Studio' },
];
const BARBERSHOP_CATEGORY = 'Barbershop';

// matched against every host named in a page; as.me, booker.com, mangomint.com, frively.com, book.app,
// portal.dental and freetimepos.com were found behind "Book now" buttons in the 2026-11-16 probe
const BOOKING_TOOLS = [
  { name: 'Fresha', domains: ['fresha.com', 'shedul.com'] },
  { name: 'Booksy', domains: ['booksy.com'] },
  { name: 'Vagaro', domains: ['vagaro.com'] },
  { name: 'Square', domains: ['squareup.com', 'square.site'] },
  { name: 'Calendly', domains: ['calendly.com'] },
  { name: 'Acuity', domains: ['acuityscheduling.com', 'as.me'] },
  { name: 'Mindbody', domains: ['mindbodyonline.com', 'mindbody.io'] },
  { name: 'GlossGenius', domains: ['glossgenius.com'] },
  { name: 'StyleSeat', domains: ['styleseat.com'] },
  { name: 'Jane', domains: ['janeapp.com'] },
  { name: 'Cliniko', domains: ['cliniko.com'] },
  { name: 'MoeGo', domains: ['moego.pet'] },
  { name: 'Timely', domains: ['gettimely.com'] },
  { name: 'Setmore', domains: ['setmore.com'] },
  { name: 'SimplyBook', domains: ['simplybook.me', 'simplybook.it'] },
  { name: 'Treatwell', domains: ['treatwell.co.uk', 'treatwell.com', 'treatwell.ie', 'mytreatwell.co.uk'] },
  { name: 'Phorest', domains: ['phorest.com'] },
  { name: 'Zenoti', domains: ['zenoti.com'] },
  { name: 'Boulevard', domains: ['joinblvd.com', 'blvd.co'] },
  { name: 'Schedulicity', domains: ['schedulicity.com'] },
  { name: 'Dentally', domains: ['dentally.co', 'dentally.com'] },
  { name: 'NexHealth', domains: ['nexhealth.com'] },
  { name: 'Zocdoc', domains: ['zocdoc.com'] },
  { name: 'LocalMed', domains: ['localmed.com'] },
  { name: 'PetDesk', domains: ['petdesk.com'] },
  { name: 'Vetstoria', domains: ['vetstoria.com'] },
  { name: 'Mangomint', domains: ['mangomint.com'] },
  { name: 'Booker', domains: ['booker.com'] },
  { name: 'Frively', domains: ['frively.com'] },
  { name: 'Salonized', domains: ['salonized.com'] },
  { name: 'Kitomba', domains: ['kitomba.com'] },
  { name: 'TimeTap', domains: ['timetap.com'] },
  { name: 'YouCanBookMe', domains: ['youcanbook.me'] },
  { name: 'Picktime', domains: ['picktime.com'] },
  { name: '10to8', domains: ['10to8.com'] },
  { name: 'Appointy', domains: ['appointy.com'] },
  { name: 'Genbook', domains: ['genbook.com'] },
  { name: 'Bookeo', domains: ['bookeo.com'] },
  { name: 'Gingr', domains: ['gingrapp.com'] },
  { name: 'SimplePractice', domains: ['simplepractice.com'] },
  { name: 'TherapyPortal', domains: ['therapyportal.com'] },
  { name: 'Halaxy', domains: ['halaxy.com'] },
  { name: 'Nookal', domains: ['nookal.com'] },
  { name: 'Power Diary', domains: ['powerdiary.com', 'zandahealth.com'] },
  { name: 'HotDoc', domains: ['hotdoc.com.au'] },
  { name: 'HealthEngine', domains: ['healthengine.com.au'] },
  { name: 'Practice Better', domains: ['practicebetter.io'] },
  { name: 'HoneyBook', domains: ['honeybook.com'] },
  { name: 'Dubsado', domains: ['dubsado.com'] },
  { name: 'Studio Ninja', domains: ['studioninja.co'] },
  { name: 'Tave', domains: ['tave.com'] },
  { name: 'Book.app', domains: ['book.app'] },
  { name: 'portal.dental', domains: ['portal.dental'] },
  { name: 'Freetime', domains: ['freetimepos.com'] },
  { name: 'Squire', domains: ['getsquire.com'] },
  { name: 'theCut', domains: ['thecut.co'] },
  { name: 'Setster', domains: ['setster.com'] },
  { name: 'BookingBug', domains: ['bookingbug.com', 'jrni.com'] },
  { name: 'Uala', domains: ['uala.com', 'uala.it'] },
  { name: 'Meevo', domains: ['meevo.com'] },
];
// Wix Bookings runs on the business's own domain, so it is found by its app id; every Wix site loads
// "wix-seo-bookings-*" strings, so those prove nothing (seen on hairstudio-a.test vs studio-b.test)
const BOOKING_TEXT_MARKERS = [{ name: 'Wix Bookings', marker: '13d21c63-b5ec-5912-8397-c3a5ddb27a97' }];
// a booking button can point at a redirect or link-in-bio service; the business books online, but the service
// is not their booking tool (seen: qrfy.com on nails-c.test, 2026-11-16)
const REDIRECT_DOMAINS = ['qrfy.com', 'bit.ly', 'tinyurl.com', 'linktr.ee', 'linkin.bio', 'beacons.ai', 'paa.ge',
  'qr-code-generator.com', 'rebrand.ly', 't.co'];
// customer pages live on <business>.acmebook.example (seen on acmebook.example, 2026-11-16)
const ACMEBOOK_DOMAINS = ['acmebook.example'];
// the bare word "acmebook" appears in unrelated text; customer pages are on acmebook.example (the embed snippet itself
// was not seen, so a widget served from another host would be missed)
const ACMEBOOK_TEXT_MARKER = 'acmebook';
// published AcmeBook sites end with "Powered by <a href="/">AcmeBook</a>", a relative link that never names
// acmebook on a custom domain (seen in acmebook.example's site code, 2026-11-16)
const ACMEBOOK_FOOTER = /powered by\s*(?:<[^>]*>\s*)*acmebook\b/i;
// links to these are never booking tools, even behind a "Book" button
const NON_BOOKING_DOMAINS = [
  'facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com', 'youtube.com',
  'youtu.be', 'linkedin.com', 'pinterest.com', 'google.com', 'goo.gl', 'g.page', 'apple.com', 'bing.com',
  'openstreetmap.org', 'yelp.com', 'yelp.co.uk', 'tripadvisor.com', 'tripadvisor.co.uk', 'trustpilot.com',
  'wa.me', 'whatsapp.com', 'nhs.uk', 'gov.uk', 'googletagmanager.com', 'doubleclick.net', 'vimeo.com', 'spotify.com',
];
// uk and other sites embed maps from google.co.uk and similar country domains
const GOOGLE_HOST = /(^|\.)google\.(com?\.)?[a-z]{2,3}$/;
const BOOKING_WORDS = /\b(book|booking|appointment|schedul|reserv)/i;
// a footer credit link says "All rights reserved" and is not booking
const RIGHTS_RESERVED = /rights\s+reserved/gi;
// a "Book an appointment" button that opens the contact page is not online booking (seen on dental-d)
const CONTACT_PATH = /contact/i;
const JUNK_EMAIL_PARTS = [
  'example.', 'sentry', 'wixpress', '@domain.com', '@email.com', 'yourname', 'yourdomain', 'yourcompany',
  'godaddy', '@2x',
];
// placeholder addresses are only junk when this is the whole part before the @ (salonname@ is real)
const JUNK_EMAIL_LOCAL_PARTS = ['name', 'user', 'test', 'email'];
const INSTAGRAM_NON_HANDLES = ['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'about', 'developer'];

// the source document's points; the +10 for an unreachable website is removed because 5 of the 7 failed sites
// measured were dead domains
const POINTS = { noOnlineBooking: 35, noWebsite: 25, email: 15, whatsapp: 10, phone: 5, instagram: 5 };
const HOT_MIN_SCORE = 60;
const WARM_MIN_SCORE = 40;

const FEEDBACK_ASK = "Would you give 10 minutes of honest feedback on AcmeBook, a simple booking tool we're building?";
const OPENERS = {
  competitor_unnamed: 'Hi {name}, saw you take bookings online... would love to hear what you like or wish was ' +
    'better about it.',
  competitor: 'Hi {name}, saw you take bookings through {tool}... would love to hear what you like or wish was ' +
    'better about it.',
  no_website: `Hi {name}, I couldn't find a way to book with you online... ${FEEDBACK_ASK}`,
  none_found: `Hi {name}, noticed your website does not have a way to book online... ${FEEDBACK_ASK}`,
  site_down: `Hi {name}, looks like bookings mostly happen by phone... ${FEEDBACK_ASK}`,
  site_blocked: '',
};

const LEADS_TABLE = 'acmebook_leads';
const CITIES_TABLE = 'acmebook_cities';
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
  { name: 'booking_status', type: 'string' },
  { name: 'booking_tool', type: 'string' },
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

// outreach: the Google Sheet Alex ticks, and the email sent from Gmail
const SHEET_HEADERS = {
  name: 'Name', city: 'City', tier: 'Tier', score: 'Score', email: 'Lead email', phone: 'Contact number',
  opener: 'Opener', send: 'Send email', sentDate: 'Sent date', status: 'Status', leadId: 'Lead ID',
};
const LEAD_STATUS = { new: 'New', sent: 'Sent', replied: 'Replied', stopped: 'Stopped', bounced: 'Bounced' };
// the id from the sheet's URL (docs.google.com/spreadsheets/d/<id>/edit), set during setup
const SHEET_ID = 'YOUR_SHEET_ID';
const SHEET_TAB = 'Leads';
// the numeric id of the Leads tab (the gid in the sheet URL); the first tab of a new sheet is always 0
const SHEET_TAB_GID = 0;
const SENDER_NAME = 'Alex';
// Alex chose the area without house and road (2026-11-16); the warning that it may not count as a valid postal
// address under CAN-SPAM is recorded in the spec
const POSTAL_ADDRESS = '1 Example Street, Springfield, IL 62701, USA';
// a new free Gmail account gets locked for bursts of cold mail; raise after 2-3 weeks without complaints
const DAILY_SEND_LIMIT = 15;
// a random pause between two emails, so the mailbox does not send in a machine-like burst
const SEND_WAIT_SECONDS = [60, 180];
// the daily limit counts Alex's calendar day
const SEND_TIMEZONE = 'America/New_York';
const EMAIL_SUBJECT = 'Quick question, {name}';
const EMAIL_BODY = [
  '{opener}',
  '',
  "There's a free plan to try it: https://acmebook.example",
  '',
  'Thanks,',
  '{sender}',
  'AcmeBook',
  '',
  '--',
  '{address}',
  'Not interested? Reply "stop" and I won\'t email again.',
].join('\n');
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
const BOUNCE_SENDER = /mailer-daemon|postmaster/i;
// where the quoted original starts in a reply from Gmail, Outlook and Apple Mail
const REPLY_QUOTE_START = /^On .+wrote:\s*$|^-{2,}\s*Original Message|^From: .*@.*$/im;
// credential ids and names are not secret; set them during setup from the n8n Credentials page
const GMAIL_CREDENTIAL = { id: 'YOUR_GMAIL_CRED', name: 'Gmail account' };
const SHEETS_CREDENTIAL = { id: 'YOUR_SHEETS_CRED', name: 'Google Sheets account 2' };
// fixed ids, so the Lead Finder can call Sheet Sync and an import replaces the same workflow each time
const WORKFLOW_IDS = { sheetSync: 'AcmeBookSheetSyn', sender: 'AcmeBookSender01', replyChecker: 'AcmeBookReplyChk' };

module.exports = {
  CITIES, CITIES_PER_RUN, SEARCH_RADIUS_METRES, OVERPASS_SERVER_TIMEOUT_SECONDS, OVERPASS_RESULT_LIMIT,
  OVERPASS_SERVERS, OVERPASS_WAITS_SECONDS, OVERPASS_REQUEST_TIMEOUT_SECONDS, OVERPASS_CITY_BUDGET_SECONDS,
  OVERPASS_USER_AGENT, BROWSER_USER_AGENT, MAX_LEADS_PER_RUN, WEBSITE_TIMEOUT_SECONDS, WEBSITE_CONCURRENCY,
  THIN_CITY_THRESHOLD, CATEGORY_RULES, BARBERSHOP_CATEGORY, BOOKING_TOOLS, BOOKING_TEXT_MARKERS, ACMEBOOK_DOMAINS,
  ACMEBOOK_TEXT_MARKER, ACMEBOOK_FOOTER, REDIRECT_DOMAINS, NON_BOOKING_DOMAINS, GOOGLE_HOST, BOOKING_WORDS,
  RIGHTS_RESERVED, CONTACT_PATH,
  JUNK_EMAIL_PARTS, JUNK_EMAIL_LOCAL_PARTS, INSTAGRAM_NON_HANDLES, POINTS, HOT_MIN_SCORE, WARM_MIN_SCORE, OPENERS,
  LEADS_TABLE, CITIES_TABLE, LEAD_COLUMNS, CITY_COLUMNS,
  SHEET_HEADERS, LEAD_STATUS, SHEET_ID, SHEET_TAB, SHEET_TAB_GID, SENDER_NAME, POSTAL_ADDRESS,
  DAILY_SEND_LIMIT, SEND_WAIT_SECONDS, SEND_TIMEZONE, EMAIL_SUBJECT, EMAIL_BODY, STOP_WORDS, BOUNCE_SENDER,
  REPLY_QUOTE_START, GMAIL_CREDENTIAL, SHEETS_CREDENTIAL, WORKFLOW_IDS,
};
