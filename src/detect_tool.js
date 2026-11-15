const { REDIRECT_DOMAINS, NON_TOOL_DOMAINS, GOOGLE_HOST, RIGHTS_RESERVED, CONTACT_PATH } = require('./config');
const {
  PRODUCT_NAME, COMPETITOR_TOOLS, COMPETITOR_TEXT_MARKERS, OWN_PRODUCT_DOMAINS, OWN_PRODUCT_TEXT_MARKER,
  OWN_PRODUCT_FOOTER, ACTION_WORDS,
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


function isNonToolHost(host) {

  return GOOGLE_HOST.test(host) || NON_TOOL_DOMAINS.some((domain) => isDomainOrSubdomain(host, domain));
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

  for (const tool of COMPETITOR_TOOLS) {
    if ([...hosts].some((host) => tool.domains.some((domain) => isDomainOrSubdomain(host, domain)))) return tool.name;
  }
  const lowerHtml = html.toLowerCase();
  const marker = COMPETITOR_TEXT_MARKERS.find((candidate) => lowerHtml.includes(candidate.marker));
  return marker ? marker.name : '';
}


function usesOwnProduct(html, hosts) {

  const onOwnProductHost = [...hosts].some(
    (host) => OWN_PRODUCT_DOMAINS.some((domain) => isDomainOrSubdomain(host, domain)));
  return onOwnProductHost || html.toLowerCase().includes(OWN_PRODUCT_TEXT_MARKER) || OWN_PRODUCT_FOOTER.test(html);
}


function findActionLinks(html, pageUrl) {

  const links = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = (match[1].match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    const text = match[2].replace(/<[^>]+>/g, ' ').replace(RIGHTS_RESERVED, ' ');
    if (!ACTION_WORDS.test(`${text} ${href}`)) continue;
    try {
      links.push(new URL(href, pageUrl));
    } catch {
      continue;
    }
  }
  return links;
}


function detectTool(html, pageUrl) {

  const hosts = findPageHosts(html);
  if (usesOwnProduct(html, hosts)) {
    return { tool_status: 'already_customer', tool_name: PRODUCT_NAME, action_page_url: '' };
  }
  const tool = findKnownTool(html, hosts);
  if (tool) return { tool_status: 'competitor', tool_name: tool, action_page_url: '' };
  const ownHosts = findOwnHosts(html, pageUrl);
  let actionPageUrl = '';
  for (const link of findActionLinks(html, pageUrl)) {
    const host = readHost(link.href);
    if (isOwnHost(host, ownHosts)) {
      const isOwnSubdomain = !ownHosts.has(host);
      const looksLikeActionPage = ACTION_WORDS.test(link.pathname) || isOwnSubdomain;
      if (!actionPageUrl && looksLikeActionPage && !CONTACT_PATH.test(link.pathname)) actionPageUrl = link.href;
      continue;
    }
    if (!host || isNonToolHost(host)) continue;
    const viaRedirect = REDIRECT_DOMAINS.some((domain) => isDomainOrSubdomain(host, domain));
    return { tool_status: 'competitor', tool_name: viaRedirect ? '' : host, action_page_url: '' };
  }
  return { tool_status: actionPageUrl ? 'action_page' : 'none_found', tool_name: '',
    action_page_url: actionPageUrl };
}


function detectActionPage(html, pageUrl) {

  const detection = detectTool(html, pageUrl);
  if (detection.tool_status === 'competitor' || detection.tool_status === 'already_customer') return detection;

  // action pages usually embed the tool in an iframe rather than linking to it
  const ownHosts = findOwnHosts(html, pageUrl);
  // tag managers put a tracking iframe inside noscript
  const visibleHtml = html.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '');
  for (const match of visibleHtml.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const host = readHost(match[1], pageUrl);
    if (host && !isOwnHost(host, ownHosts) && !isNonToolHost(host)) {
      return { tool_status: 'competitor', tool_name: host, action_page_url: '' };
    }
  }
  return { tool_status: 'none_found', tool_name: '', action_page_url: '' };
}

module.exports = { readHost, isDomainOrSubdomain, isNonToolHost, detectTool, detectActionPage };
