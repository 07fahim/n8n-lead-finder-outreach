const {
  MAX_LEADS_PER_RUN, WEBSITE_TIMEOUT_SECONDS, WEBSITE_CONCURRENCY, BROWSER_USER_AGENT, REDIRECT_DOMAINS,
} = require('./config');
const {
  readHost, isDomainOrSubdomain, isNonToolHost, detectTool, detectActionPage,
} = require('./detect_tool');
const { findEmails, findWhatsapp, findInstagram } = require('./read_contacts');
const { buildLead } = require('./score_lead');

function isLocalHost(host) {

  // websites come from OpenStreetMap, which anyone can edit, so a planted address must not reach this machine
  // or its local network
  // ponytail: a public name that resolves to a private ip, and redirects to one, are not caught; checking those
  // needs a dns lookup before each fetch and redirects followed by hand
  return host === 'localhost' || /\.(local|internal)$/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
    || host.startsWith('[');
}


function hasNoOwnWebsite(host) {

  // a business whose only page is facebook or a link-in-bio has no website of its own
  return isNonToolHost(host) || REDIRECT_DOMAINS.some((domain) => isDomainOrSubdomain(host, domain));
}


function classifyFetchError(error) {

  // measured 2026-11-16: 5 of the 7 failed sites had no DNS record any more, so the business may have closed
  return ['ENOTFOUND', 'ECONNREFUSED'].includes(error.code) ? 'site_down' : 'site_blocked';
}


function classifyStatus(statusCode) {

  if ([404, 410].includes(statusCode)) return 'site_down';

  // a 3xx here means no page came back, and calling that none_found would be a false claim
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
  const host = readHost(business.website);
  if (!business.website || hasNoOwnWebsite(host)) {
    return { tool_status: 'no_website', tool_name: '', ...noContacts };
  }
  if (isLocalHost(host)) return { tool_status: 'site_blocked', tool_name: '', ...noContacts };
  const homepage = await fetchPage(business.website, httpRequest);
  if (homepage.outcome !== 'loaded') return { tool_status: homepage.outcome, tool_name: '', ...noContacts };
  let detection = detectTool(homepage.html, business.website);
  if (detection.tool_status === 'action_page') {
    const actionPage = await fetchPage(detection.action_page_url, httpRequest);

    // an action page we could not open may well use a tool, so it is left for a person to check
    detection = actionPage.outcome === 'loaded'
      ? detectActionPage(actionPage.html, detection.action_page_url)
      : { tool_status: 'site_blocked', tool_name: '' };
  }
  return {
    tool_status: detection.tool_status,
    tool_name: detection.tool_name,
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
      const check = { tool_status: 'site_blocked', tool_name: '', emails: [], whatsapp: '', instagram: '' };
      const lead = buildLead(business, check, today);
      lead.reasons += `; check failed: ${error.message}`;
      console.warn(`'${business.osm_key}': check failed, ${error.message}`);
      return lead;
    }
  });
  return leads.filter(Boolean).sort((first, second) => second.score - first.score);
}

module.exports = { checkWebsite, checkBusinesses };
