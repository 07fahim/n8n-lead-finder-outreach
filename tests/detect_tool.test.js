const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { detectTool, detectActionPage } = require('../src/detect_tool');

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', 'html', `${name}.html`), 'utf8');
}

const REAL_SITES = [
  ['salon-h', 'https://salon-h.test/', 'competitor', 'Mangomint'],
  ['studio-i', 'https://www.studio-i.test/', 'competitor', 'Acuity'],
  ['nailbar-e', 'https://nailbar-e.test/', 'competitor', 'Freetime'],
  ['bodybar-g', 'https://bodybar-g.test', 'competitor', 'Booker'],
  ['dental-d', 'https://www.dental-d.test/', 'competitor', 'portal.dental'],
];

for (const [name, url, status, tool] of REAL_SITES) {
  test(`real site ${name} -> ${status} ${tool}`, () => {
    const detection = detectTool(readFixture(name), url);
    assert.equal(detection.tool_status, status);
    assert.equal(detection.tool_name, tool);
  });
}

test('real site salon-f links to its own /book-now page', () => {
  const detection = detectTool(readFixture('salon-f'), 'https://salon-f.test/');
  assert.equal(detection.tool_status, 'action_page');
  assert.match(detection.action_page_url, /^https:\/\/salon-f\.com\/book-now\/?$/);
});

test('a known tool loaded by a script counts as a competitor with its name', () => {
  const html = '<script src="https://widget.fresha.com/widget.js"></script>';
  assert.equal(detectTool(html, 'https://salon.com').tool_name, 'Fresha');
});

test('an unknown tool behind a Book button counts as a competitor with its domain', () => {
  const html = '<a href="https://bookme.newtool.io/salon">Book now</a>';
  assert.deepEqual(detectTool(html, 'https://salon.com'),
    { tool_status: 'competitor', tool_name: 'bookme.newtool.io', action_page_url: '' });
});

test('facebook and contact-page buttons are not booking', () => {
  const html = '<a href="https://facebook.com/salon">Book on Facebook</a><a href="/contact">Book an appointment</a>';
  assert.equal(detectTool(html, 'https://salon.com').tool_status, 'none_found');
});

test('own pages count through www and canonical hosts', () => {
  const html = '<link rel="canonical" href="https://new-salon.com/">' +
    '<a href="https://www.new-salon.com/booking">Book</a>';
  const detection = detectTool(html, 'https://old-salon.com');
  assert.equal(detection.tool_status, 'action_page');
  assert.equal(detection.action_page_url, 'https://www.new-salon.com/booking');
});

test('a page on or linking to a acmebook.example subdomain is an existing customer', () => {
  const html = '<a href="https://lumenstudio.acmebook.example/">Book now</a>';
  assert.equal(detectTool(html, 'https://lumenstudio.com').tool_status, 'already_customer');
});

test('a AcmeBook widget marks the business as an existing customer', () => {
  const html = '<script src="https://cdn.example.com/widgets/acmebook-embed.js"></script>';
  assert.equal(detectTool(html, 'https://a.com').tool_status, 'already_customer');
});

test('a bare mention of acmebook in page text is not an existing customer', () => {
  assert.equal(detectTool('<p>Join the acmebooks newsletter</p>', 'https://a.com').tool_status, 'none_found');
});

test('a footer credit link saying all rights reserved is not booking', () => {
  const html = '<a href="https://webdesignco.com">© 2026 Salon. All rights reserved</a>';
  assert.equal(detectTool(html, 'https://salon.com').tool_status, 'none_found');
});

test('a booking tool whose host merely starts with google. is still a competitor', () => {
  const html = '<a href="https://google.bookingtool.io/salon">Book now</a>';
  assert.equal(detectTool(html, 'https://salon.com').tool_name, 'google.bookingtool.io');
});

test('a footer credit with a non-breaking space in rights reserved is not booking', () => {
  const html = '<a href="https://webdesignco.com">All rights reserved</a>';
  assert.equal(detectTool(html, 'https://salon.com').tool_status, 'none_found');
});

test('a AcmeBook site on its own domain is found by its footer or default description', () => {
  const footer = '<div class="sp-footer"><p>Powered by <a href="/">AcmeBook</a></p></div>';
  assert.equal(detectTool(footer, 'https://lumenstudio.com').tool_status, 'already_customer');
  const description = '<meta name="description" ' +
    'content="Book appointments and shop online with Lumen. Powered by AcmeBook.">';
  assert.equal(detectTool(description, 'https://lumenstudio.com').tool_status, 'already_customer');
});

test('wix bookings is found by its app id, not by the seo strings every wix site loads', () => {
  const bookings = '<script>{"appDefinitionId":"13d21c63-b5ec-5912-8397-c3a5ddb27a97"}</script>';
  assert.equal(detectTool(bookings, 'https://hue.com').tool_name, 'Wix Bookings');
  const plainWix = '<script>{"788":"wix-seo-bookings-service-index"}</script>';
  assert.equal(detectTool(plainWix, 'https://slice.com').tool_status, 'none_found');
});

test('meevo is a known tool', () => {
  const html = '<a href="https://na0.meevo.com/CustomerPortal/x">Book now</a>';
  assert.equal(detectTool(html, 'https://salon.com').tool_name, 'Meevo');
});

test('a booking link through a redirect service is booking with the tool left unnamed', () => {
  const html = '<a href="http://qrfy.com/p/r19V2YJsiD">Book Your Appointment Now!</a>';
  assert.deepEqual(detectTool(html, 'https://nails-c.test'),
    { tool_status: 'competitor', tool_name: '', action_page_url: '' });
});

test('a page with no booking signs is none_found', () => {
  assert.equal(detectTool('<a href="/about">About us</a>', 'https://a.com').tool_status, 'none_found');
});

test('booking page: an embedded unknown widget is a competitor, a map is not', () => {
  const widget = '<iframe src="https://widget.unknowntool.io/embed/1"></iframe>';
  assert.deepEqual(detectActionPage(widget, 'https://a.com/book'),
    { tool_status: 'competitor', tool_name: 'widget.unknowntool.io', action_page_url: '' });
  const map = '<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>';
  assert.equal(detectActionPage(map, 'https://a.com/book').tool_status, 'none_found');
});

const NON_TOOL_IFRAMES = [
  ['a tag manager iframe in noscript',
    '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-X"></iframe></noscript>'],
  ['a map from a google country domain', '<iframe src="https://maps.google.co.uk/maps?q=x&output=embed"></iframe>'],
  ['a vimeo video', '<iframe src="https://player.vimeo.com/video/1"></iframe>'],
];

for (const [description, html] of NON_TOOL_IFRAMES) {
  test(`booking page: ${description} is not a booking tool`, () => {
    assert.equal(detectActionPage(html, 'https://a.com/book').tool_status, 'none_found');
  });
}
