const { REDIRECT_DOMAINS, NON_BOOKING_DOMAINS, GOOGLE_HOST, RIGHTS_RESERVED, CONTACT_PATH } = require('./config');
const {
  BOOKING_TOOLS, BOOKING_TEXT_MARKERS, ACMEBOOK_DOMAINS, ACMEBOOK_TEXT_MARKER, ACMEBOOK_FOOTER, BOOKING_WORDS,
} = require('./product');

function readHost(url, baseUrl) {

  try {
    return new URL(url, baseUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}


function isDomainOrSubdomain(host, domain) {

  return host === domain || host.endsWith(`.${domain}`);
}


function isNonBookingHost(host) {

  return GOOGLE_HOST.test(host) || NON_BOOKING_DOMAINS.some((domain) => isDomainOrSubdomain(host, domain));
}


function findPageHosts(html) {

  // urls inside inline JSON are written with escaped slashes (https:\/\/host)
  const hosts = new Set();
  for (const match of html.matchAll(/(?:https?:)?(?:\/\/|\\\/\\\/)([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) {
    hosts.add(match[1].toLowerCase().replace(/^www\./, ''));
  }
  return hosts;
}


function findOwnHosts(html, pageUrl) {

  // a site that redirected to a new domain names that domain in its canonical or og:url tag
  const ownHosts = new Set([readHost(pageUrl)]);
  for (const match of html.matchAll(/<(?:link|meta)\b[^>]*(?:rel=["']canonical["']|property=["']og:url["'])[^>]*>/gi)) {
    const address = match[0].match(/(?:href|content)=["']([^"']+)["']/i);
    if (address) ownHosts.add(readHost(address[1]));
  }
  ownHosts.delete('');
  return ownHosts;
}


function isOwnHost(host, ownHosts) {

  return [...ownHosts].some((ownHost) => isDomainOrSubdomain(host, ownHost));
}


function findKnownTool(html, hosts) {

  for (const tool of BOOKING_TOOLS) {
    if ([...hosts].some((host) => tool.domains.some((domain) => isDomainOrSubdomain(host, domain)))) return tool.name;
  }
  const lowerHtml = html.toLowerCase();
  const marker = BOOKING_TEXT_MARKERS.find((candidate) => lowerHtml.includes(candidate.marker));
  return marker ? marker.name : '';
}


function usesAcmebook(html, hosts) {

  const onAcmebookHost = [...hosts].some(
    (host) => ACMEBOOK_DOMAINS.some((domain) => isDomainOrSubdomain(host, domain)));
  return onAcmebookHost || html.toLowerCase().includes(ACMEBOOK_TEXT_MARKER) || ACMEBOOK_FOOTER.test(html);
}


function findBookingLinks(html, pageUrl) {

  const links = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = (match[1].match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    const text = match[2].replace(/<[^>]+>/g, ' ').replace(RIGHTS_RESERVED, ' ');
    if (!BOOKING_WORDS.test(`${text} ${href}`)) continue;
    try {
      links.push(new URL(href, pageUrl));
    } catch {
      continue;
    }
  }
  return links;
}


function detectBooking(html, pageUrl) {

  const hosts = findPageHosts(html);
  if (usesAcmebook(html, hosts)) return { booking_status: 'acmebook', booking_tool: 'AcmeBook', booking_page_url: '' };
  const tool = findKnownTool(html, hosts);
  if (tool) return { booking_status: 'competitor', booking_tool: tool, booking_page_url: '' };
  const ownHosts = findOwnHosts(html, pageUrl);
  let bookingPageUrl = '';
  for (const link of findBookingLinks(html, pageUrl)) {
    const host = readHost(link.href);
    if (isOwnHost(host, ownHosts)) {
      const isOwnSubdomain = !ownHosts.has(host);
      const looksLikeBookingPage = BOOKING_WORDS.test(link.pathname) || isOwnSubdomain;
      if (!bookingPageUrl && looksLikeBookingPage && !CONTACT_PATH.test(link.pathname)) bookingPageUrl = link.href;
      continue;
    }
    if (!host || isNonBookingHost(host)) continue;
    const viaRedirect = REDIRECT_DOMAINS.some((domain) => isDomainOrSubdomain(host, domain));
    return { booking_status: 'competitor', booking_tool: viaRedirect ? '' : host, booking_page_url: '' };
  }
  return { booking_status: bookingPageUrl ? 'booking_page' : 'none_found', booking_tool: '',
    booking_page_url: bookingPageUrl };
}


function detectBookingPage(html, pageUrl) {

  const detection = detectBooking(html, pageUrl);
  if (detection.booking_status === 'competitor' || detection.booking_status === 'acmebook') return detection;

  // booking pages usually embed the tool in an iframe rather than linking to it
  const ownHosts = findOwnHosts(html, pageUrl);
  // tag managers put a tracking iframe inside noscript
  const visibleHtml = html.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '');
  for (const match of visibleHtml.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const host = readHost(match[1], pageUrl);
    if (host && !isOwnHost(host, ownHosts) && !isNonBookingHost(host)) {
      return { booking_status: 'competitor', booking_tool: host, booking_page_url: '' };
    }
  }
  return { booking_status: 'none_found', booking_tool: '', booking_page_url: '' };
}

module.exports = { readHost, isDomainOrSubdomain, isNonBookingHost, detectBooking, detectBookingPage };
