const test = require('node:test');
const assert = require('node:assert/strict');
const { LEAD_COLUMNS } = require('../src/config');
const { buildLead, findTier } = require('../src/score_lead');

const BUSINESS = { osm_key: 'node/1', name: 'Cut Co', category: 'Hair Salon', country: 'UK', city: 'Leeds',
  phone: '+44 1', email: '', website: 'https://cutco.com', instagram: '', address: 'Leeds', maps_link: 'm' };
const TODAY = '2026-11-16T10:00:00.000Z';

function makeCheck(bookingStatus, extra = {}) {
  return { booking_status: bookingStatus, booking_tool: '', emails: [], whatsapp: '', instagram: '', ...extra };
}

test('website without booking, email and phone scores 55 and is Warm (accepted effect of 60/40)', () => {
  const lead = buildLead(BUSINESS, makeCheck('none_found', { emails: ['a@cutco.com'] }), TODAY);
  assert.equal(lead.score, 55);
  assert.equal(lead.tier, 'Warm');
  assert.equal(lead.email, 'a@cutco.com');
  assert.match(lead.opener, /^Hi Cut Co, noticed your website does not have a way to book online/);
});

test('no website and a phone scores 65 and is Hot', () => {
  const lead = buildLead({ ...BUSINESS, website: '' }, makeCheck('no_website'), TODAY);
  assert.equal(lead.score, 65);
  assert.equal(lead.tier, 'Hot');
  assert.match(lead.opener, /couldn't find a way to book with you online/);
});

test('a competitor gets no booking points and the feedback opener', () => {
  const check = makeCheck('competitor', { booking_tool: 'Fresha', emails: ['a@b.co'], whatsapp: 'https://wa.me/1',
    instagram: 'cutco' });
  const lead = buildLead(BUSINESS, check, TODAY);
  assert.equal(lead.score, 35);
  assert.equal(lead.tier, 'Cold');
  assert.match(lead.reasons, /^uses Fresha/);
  assert.equal(lead.opener,
    'Hi Cut Co, saw you take bookings through Fresha... would love to hear what you like or wish was better about it.');
});

test('site down and site blocked get no booking points and a reason to check by hand', () => {
  const down = buildLead(BUSINESS, makeCheck('site_down'), TODAY);
  assert.equal(down.score, 5);
  assert.match(down.reasons, /website down, check the business is still open/);
  assert.match(down.opener, /^Hi Cut Co, looks like bookings mostly happen by phone/);
  const blocked = buildLead(BUSINESS, makeCheck('site_blocked'), TODAY);
  assert.equal(blocked.opener, '');
  assert.equal(blocked.score, 5);
  assert.match(blocked.reasons, /site blocked our check, look by hand/);
});

test('a $ in a business name is written as it is', () => {
  const lead = buildLead({ ...BUSINESS, name: "$$ Cuts & Fade$`s" }, makeCheck('none_found'), TODAY);
  assert.ok(lead.opener.startsWith("Hi $$ Cuts & Fade$`s, noticed"));
});

test('a competitor whose tool is unknown gets an opener without a tool name', () => {
  const lead = buildLead(BUSINESS, makeCheck('competitor'), TODAY);
  assert.equal(lead.opener,
    'Hi Cut Co, saw you take bookings online... would love to hear what you like or wish was better about it.');
  assert.match(lead.reasons, /^uses an online booking tool/);
});

test('tier edges', () => {
  assert.deepEqual([39, 40, 59, 60].map(findTier), ['Cold', 'Warm', 'Warm', 'Hot']);
});

test('existing AcmeBook customers are not leads', () => {
  assert.equal(buildLead(BUSINESS, makeCheck('acmebook'), TODAY), null);
});

test('OSM contacts win over page contacts; row keys match the table columns', () => {
  const lead = buildLead({ ...BUSINESS, email: 'osm@cutco.com', instagram: 'osm_ig' },
    makeCheck('none_found', { emails: ['page@cutco.com'], instagram: 'page_ig' }), TODAY);
  assert.equal(lead.email, 'osm@cutco.com');
  assert.equal(lead.instagram, 'osm_ig');
  assert.deepEqual(Object.keys(lead), LEAD_COLUMNS.map((column) => column.name));
  assert.equal(lead.status, 'New');
  assert.equal(lead.date_found, TODAY);
});
