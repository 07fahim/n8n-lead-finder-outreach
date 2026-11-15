const test = require('node:test');
const assert = require('node:assert/strict');
const { checkWebsite, checkBusinesses } = require('../src/check_websites');

const TODAY = '2026-11-16T00:00:00.000Z';

function makeError(code) {

  return Object.assign(new Error(code), { code });
}


function makeHttpRequest(pages) {

  const requested = [];
  const httpRequest = async (options) => {
    requested.push(options.url);
    const page = pages[options.url];
    if (page instanceof Error) throw page;
    return page || { statusCode: 404, body: '' };
  };
  return { httpRequest, requested };
}


function makeBusiness(website, extra = {}) {

  return { osm_key: `node/${website}`, name: 'Salon', category: 'Hair Salon', country: 'UK', city: 'Leeds',
    phone: '1', email: '', website, instagram: '', address: 'Leeds', maps_link: 'm', ...extra };
}

test('no website is not fetched', async () => {
  const network = makeHttpRequest({});
  const check = await checkWebsite(makeBusiness(''), network.httpRequest);
  assert.equal(check.booking_status, 'no_website');
  assert.deepEqual(network.requested, []);
});

test('fetch failures are sorted into site_down and site_blocked', async () => {
  const pages = {
    'https://dead.com': makeError('ENOTFOUND'),
    'https://refused.com': makeError('ECONNREFUSED'),
    'https://gone.com': { statusCode: 404, body: '' },
    'https://removed.com': { statusCode: 410, body: '' },
    'https://guarded.com': { statusCode: 403, body: 'denied' },
    'https://slow.com': makeError('ECONNABORTED'),
    'https://moved.com': { statusCode: 301, body: '' },
    'https://busy.com': { statusCode: 429, body: '' },
    'https://unavailable.com': { statusCode: 503, body: '' },
    'https://hidden.com': { statusCode: 200, body: '<a href="/booking">Book</a>' },
    'https://hidden.com/booking': { statusCode: 404, body: '' },
  };
  const expected = {
    'https://dead.com': 'site_down',
    'https://refused.com': 'site_down',
    'https://gone.com': 'site_down',
    'https://removed.com': 'site_down',
    'https://guarded.com': 'site_blocked',
    'https://slow.com': 'site_blocked',
    'https://moved.com': 'site_blocked',
    'https://busy.com': 'site_blocked',
    'https://unavailable.com': 'site_blocked',
    'https://hidden.com': 'site_blocked',
  };
  const network = makeHttpRequest(pages);
  const statuses = {};
  for (const website of Object.keys(expected)) {
    statuses[website] = (await checkWebsite(makeBusiness(website), network.httpRequest)).booking_status;
  }
  assert.deepEqual(statuses, expected);
});

test('an own booking page is fetched and checked; contacts come from the homepage', async () => {
  const network = makeHttpRequest({
    'https://salon.com': { statusCode: 200,
      body: '<a href="/book-now">Book</a> hi@salon.com <a href="https://wa.me/447700900123">chat</a>' },
    'https://salon.com/book-now': { statusCode: 200, body: '<script src="https://widget.fresha.com/x.js"></script>' },
  });
  const check = await checkWebsite(makeBusiness('https://salon.com'), network.httpRequest);
  assert.deepEqual(network.requested, ['https://salon.com', 'https://salon.com/book-now']);
  assert.equal(check.booking_status, 'competitor');
  assert.equal(check.booking_tool, 'Fresha');
  assert.deepEqual(check.emails, ['hi@salon.com']);
  assert.equal(check.whatsapp, 'https://wa.me/447700900123');
});

test('a booking page that cannot be fetched is checked by hand, not called none_found', async () => {
  const network = makeHttpRequest({
    'https://salon.com': { statusCode: 200, body: '<a href="/booking">Book</a>' },
    'https://salon.com/booking': makeError('ECONNABORTED'),
  });
  const check = await checkWebsite(makeBusiness('https://salon.com'), network.httpRequest);
  assert.equal(check.booking_status, 'site_blocked');
});

test('the run keeps exactly 200 leads and sorts them by score', async () => {
  const businesses = Array.from({ length: 250 }, (_, index) => makeBusiness('', { osm_key: `node/${index}` }));
  const network = makeHttpRequest({});
  const leads = await checkBusinesses(businesses, network.httpRequest, TODAY, () => 0);
  assert.equal(leads.length, 200);
  for (let index = 1; index < leads.length; index++) assert.ok(leads[index - 1].score >= leads[index].score);
});

test('AcmeBook customers are dropped from the leads', async () => {
  const businesses = [
    makeBusiness('https://customer.com', { osm_key: 'node/customer' }),
    makeBusiness('https://plain.com', { osm_key: 'node/plain' }),
  ];
  const network = makeHttpRequest({
    'https://customer.com': { statusCode: 200,
      body: '<script src="https://lumenstudio.acmebook.example/widget.js"></script>' },
    'https://plain.com': { statusCode: 200, body: '<p>call us</p>' },
  });
  const leads = await checkBusinesses(businesses, network.httpRequest, TODAY, () => 0);
  assert.deepEqual(leads.map((lead) => lead.osm_key), ['node/plain']);
});

test('businesses are shuffled before the cap', async () => {
  const businesses = ['a', 'b', 'c'].map((key) => makeBusiness('', { osm_key: `node/${key}` }));
  const network = makeHttpRequest({});
  const orderFor = async (random) => (await checkBusinesses(businesses, network.httpRequest, TODAY, random))
    .map((lead) => lead.osm_key);
  assert.deepEqual(await orderFor(() => 0), ['node/b', 'node/c', 'node/a']);
  assert.deepEqual(await orderFor(() => 0.999), ['node/a', 'node/b', 'node/c']);
});

test('a check that throws is kept for a person, with the error in its reasons', async (context) => {
  const warn = context.mock.method(console, 'warn', () => {});
  let websiteReads = 0;
  const business = makeBusiness('', { osm_key: 'node/broken' });

  // the second read is checkWebsite's own, outside fetchPage's catch, so only the per-business catch can take it
  Object.defineProperty(business, 'website', {
    get() {
      websiteReads++;
      if (websiteReads === 2) throw new Error('boom');
      return 'https://broken.com';
    },
  });
  const network = makeHttpRequest({ 'https://broken.com': { statusCode: 200, body: '<p>hi</p>' } });
  const leads = await checkBusinesses([business], network.httpRequest, TODAY, () => 0);
  assert.equal(leads[0].booking_status, 'site_blocked');
  assert.match(leads[0].reasons, /check failed: boom/);
  assert.deepEqual(warn.mock.calls[0].arguments, ["'node/broken': check failed, boom"]);
});
