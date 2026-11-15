const test = require('node:test');
const assert = require('node:assert/strict');
const { checkWebsite, checkBusinesses } = require('../src/check_websites');

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
  const network = makeHttpRequest({
    'https://dead.com': makeError('ENOTFOUND'),
    'https://gone.com': { statusCode: 404, body: '' },
    'https://guarded.com': { statusCode: 403, body: 'denied' },
    'https://slow.com': makeError('ECONNABORTED'),
  });
  const statuses = [];
  for (const website of ['https://dead.com', 'https://gone.com', 'https://guarded.com', 'https://slow.com']) {
    statuses.push((await checkWebsite(makeBusiness(website), network.httpRequest)).booking_status);
  }
  assert.deepEqual(statuses, ['site_down', 'site_down', 'site_blocked', 'site_blocked']);
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

test('the run keeps 200 leads at most, drops AcmeBook customers and sorts by score', async () => {
  const businesses = Array.from({ length: 250 }, (_, index) => makeBusiness('', { osm_key: `node/${index}` }));
  businesses.push(makeBusiness('https://customer.com', { osm_key: 'node/customer' }));
  businesses.push(makeBusiness('https://plain.com', { osm_key: 'node/plain' }));
  const network = makeHttpRequest({
    'https://customer.com': { statusCode: 200,
      body: '<script src="https://lumenstudio.acmebook.example/widget.js"></script>' },
    'https://plain.com': { statusCode: 200, body: '<p>call us</p>' },
  });
  const leads = await checkBusinesses(businesses, network.httpRequest, '2026-11-16T00:00:00.000Z');
  assert.ok(leads.length <= 200);
  assert.ok(!leads.some((lead) => lead.osm_key === 'node/customer'));
  for (let index = 1; index < leads.length; index++) assert.ok(leads[index - 1].score >= leads[index].score);
});
