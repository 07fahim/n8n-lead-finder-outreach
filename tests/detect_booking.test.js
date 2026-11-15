const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { detectBooking, detectBookingPage } = require('../src/detect_booking');

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
    const detection = detectBooking(readFixture(name), url);
    assert.equal(detection.booking_status, status);
    assert.equal(detection.booking_tool, tool);
  });
}

test('real site salon-f links to its own /book-now page', () => {
  const detection = detectBooking(readFixture('salon-f'), 'https://salon-f.test/');
  assert.equal(detection.booking_status, 'booking_page');
  assert.match(detection.booking_page_url, /^https:\/\/salon-f\.com\/book-now\/?$/);
});

test('a known tool loaded by a script counts as a competitor with its name', () => {
  const html = '<script src="https://widget.fresha.com/widget.js"></script>';
  assert.equal(detectBooking(html, 'https://salon.com').booking_tool, 'Fresha');
});

test('an unknown tool behind a Book button counts as a competitor with its domain', () => {
  const html = '<a href="https://bookme.newtool.io/salon">Book now</a>';
  assert.deepEqual(detectBooking(html, 'https://salon.com'),
    { booking_status: 'competitor', booking_tool: 'bookme.newtool.io', booking_page_url: '' });
});

test('facebook and contact-page buttons are not booking', () => {
  const html = '<a href="https://facebook.com/salon">Book on Facebook</a><a href="/contact">Book an appointment</a>';
  assert.equal(detectBooking(html, 'https://salon.com').booking_status, 'none_found');
});

test('own pages count through www and canonical hosts', () => {
  const html = '<link rel="canonical" href="https://new-salon.com/">' +
    '<a href="https://www.new-salon.com/booking">Book</a>';
  const detection = detectBooking(html, 'https://old-salon.com');
  assert.equal(detection.booking_status, 'booking_page');
  assert.equal(detection.booking_page_url, 'https://www.new-salon.com/booking');
});

test('a page on or linking to a acmebook.example subdomain is an existing customer', () => {
  const html = '<a href="https://lumenstudio.acmebook.example/">Book now</a>';
  assert.equal(detectBooking(html, 'https://lumenstudio.com').booking_status, 'acmebook');
});

test('a AcmeBook widget marks the business as an existing customer', () => {
  const html = '<script src="https://cdn.example.com/widgets/acmebook-embed.js"></script>';
  assert.equal(detectBooking(html, 'https://a.com').booking_status, 'acmebook');
});

test('a bare mention of acmebook in page text is not an existing customer', () => {
  assert.equal(detectBooking('<p>Join the acmebooks newsletter</p>', 'https://a.com').booking_status, 'none_found');
});

test('a footer credit link saying all rights reserved is not booking', () => {
  const html = '<a href="https://webdesignco.com">© 2026 Salon. All rights reserved</a>';
  assert.equal(detectBooking(html, 'https://salon.com').booking_status, 'none_found');
});

test('a page with no booking signs is none_found', () => {
  assert.equal(detectBooking('<a href="/about">About us</a>', 'https://a.com').booking_status, 'none_found');
});

test('booking page: an embedded unknown widget is a competitor, a map is not', () => {
  const widget = '<iframe src="https://widget.unknowntool.io/embed/1"></iframe>';
  assert.deepEqual(detectBookingPage(widget, 'https://a.com/book'),
    { booking_status: 'competitor', booking_tool: 'widget.unknowntool.io', booking_page_url: '' });
  const map = '<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>';
  assert.equal(detectBookingPage(map, 'https://a.com/book').booking_status, 'none_found');
});

const NON_BOOKING_IFRAMES = [
  ['a tag manager iframe in noscript',
    '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-X"></iframe></noscript>'],
  ['a map from a google country domain', '<iframe src="https://maps.google.co.uk/maps?q=x&output=embed"></iframe>'],
  ['a vimeo video', '<iframe src="https://player.vimeo.com/video/1"></iframe>'],
];

for (const [description, html] of NON_BOOKING_IFRAMES) {
  test(`booking page: ${description} is not a booking tool`, () => {
    assert.equal(detectBookingPage(html, 'https://a.com/book').booking_status, 'none_found');
  });
}
