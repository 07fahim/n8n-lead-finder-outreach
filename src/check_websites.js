const { MAX_LEADS_PER_RUN, WEBSITE_TIMEOUT_SECONDS, WEBSITE_CONCURRENCY, BROWSER_USER_AGENT } = require('./config');
const { detectBooking, detectBookingPage } = require('./detect_booking');
const { findEmails, findWhatsapp, findInstagram } = require('./read_contacts');
const { buildLead } = require('./score_lead');

function classifyFetchError(error) {

  // measured 2026-11-16: 5 of the 7 failed sites had no DNS record any more, so the business may have closed
  return ['ENOTFOUND', 'ECONNREFUSED'].includes(error.code) ? 'site_down' : 'site_blocked';
}


function classifyStatus(statusCode) {

  if ([404, 410].includes(statusCode)) return 'site_down';

  // the helper follows redirects, so a 3xx here means the page was never reached and none_found would be a false claim
  return statusCode >= 200 && statusCode < 300 ? 'loaded' : 'site_blocked';
}


async function fetchPage(url, httpRequest) {

  try {
    const response = await httpRequest({
      url,
      returnFullResponse: true,
      ignoreHttpStatusErrors: true,
      timeout: WEBSITE_TIMEOUT_SECONDS * 1000,
      encoding: 'text',
      json: false,
      headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'text/html' },
    });
    const outcome = classifyStatus(response.statusCode);
    return { outcome, html: outcome === 'loaded' ? String(response.body ?? '') : '' };
  } catch (error) {
    return { outcome: classifyFetchError(error), html: '' };
  }
}


async function checkWebsite(business, httpRequest) {

  const noContacts = { emails: [], whatsapp: '', instagram: '' };
  if (!business.website) return { booking_status: 'no_website', booking_tool: '', ...noContacts };
  const homepage = await fetchPage(business.website, httpRequest);
  if (homepage.outcome !== 'loaded') return { booking_status: homepage.outcome, booking_tool: '', ...noContacts };
  let detection = detectBooking(homepage.html, business.website);
  if (detection.booking_status === 'booking_page') {
    const bookingPage = await fetchPage(detection.booking_page_url, httpRequest);

    // a booking page we could not open may well take bookings, so it is left for a person to check
    detection = bookingPage.outcome === 'loaded'
      ? detectBookingPage(bookingPage.html, detection.booking_page_url)
      : { booking_status: 'site_blocked', booking_tool: '' };
  }
  return {
    booking_status: detection.booking_status,
    booking_tool: detection.booking_tool,
    emails: findEmails(homepage.html),
    whatsapp: findWhatsapp(homepage.html),
    instagram: findInstagram(homepage.html),
  };
}


function shuffle(items, random) {

  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}


async function runInPool(items, limit, worker) {

  const results = new Array(items.length);
  let nextIndex = 0;
  const workOnQueue = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, workOnQueue));
  return results;
}


async function checkBusinesses(businesses, httpRequest, today, random = Math.random) {

  // shuffled before the cap so a dense city does not always lose the same businesses
  const chosen = shuffle(businesses, random).slice(0, MAX_LEADS_PER_RUN);
  const leads = await runInPool(chosen, WEBSITE_CONCURRENCY, async (business) => {
    try {
      return buildLead(business, await checkWebsite(business, httpRequest), today);
    } catch (error) {

      // a bug must not look like a site that refused us, so the error stays on the lead and in the log
      const check = { booking_status: 'site_blocked', booking_tool: '', emails: [], whatsapp: '', instagram: '' };
      const lead = buildLead(business, check, today);
      if (lead) lead.reasons += `; check failed: ${error.message}`;
      console.warn(`'${business.osm_key}': check failed, ${error.message}`);
      return lead;
    }
  });
  return leads.filter(Boolean).sort((first, second) => second.score - first.score);
}

module.exports = { checkWebsite, checkBusinesses };
