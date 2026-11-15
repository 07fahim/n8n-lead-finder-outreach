const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LEAD_COLUMNS, CITY_COLUMNS, OVERPASS_REQUEST_TIMEOUT_SECONDS, OVERPASS_SERVER_TIMEOUT_SECONDS,
} = require('../src/config');
const { CITIES, CATEGORY_RULES, BOOKING_TOOLS } = require('../src/product');
const product = require('../src/product');

test('43 unique cities in the five markets, document order first', () => {
  assert.equal(CITIES.length, 43);
  assert.equal(new Set(CITIES.map((city) => `${city.city}|${city.country}`)).size, 43);
  for (const city of CITIES) {
    assert.ok(Math.abs(city.lat) <= 90 && Math.abs(city.lon) <= 180, city.city);
    assert.ok(['US', 'CA', 'AU', 'UK', 'IE'].includes(city.country), city.city);
  }
  assert.deepEqual(
    CITIES.slice(0, 4).map((city) => city.city),
    ['Nashville', 'Charlotte', 'Tampa', 'Las Vegas'],
  );
});

test('13 target categories', () => {
  assert.equal(new Set(CATEGORY_RULES.map((rule) => rule.category)).size, 13);
});

test('booking tool domains are bare lower-case hosts', () => {
  for (const tool of BOOKING_TOOLS) {
    for (const domain of tool.domains) assert.match(domain, /^[a-z0-9.-]+\.[a-z]+$/, tool.name);
  }
});

test('table columns have names and n8n types', () => {
  for (const column of [...LEAD_COLUMNS, ...CITY_COLUMNS]) {
    assert.match(column.name, /^[a-z][a-z_]*$/);
    assert.ok(['string', 'number', 'date', 'boolean'].includes(column.type), column.name);
  }
  assert.equal(LEAD_COLUMNS[0].name, 'osm_key');
});

test('the overpass client waits longer than the server may run', () => {
  assert.ok(OVERPASS_REQUEST_TIMEOUT_SECONDS > OVERPASS_SERVER_TIMEOUT_SECONDS);
});

test('the product file holds every product value the engine needs', () => {
  const needed = ['PRODUCT_NAME', 'TABLE_PREFIX', 'CITIES', 'CATEGORY_RULES', 'BARBERSHOP_CATEGORY', 'BOOKING_TOOLS',
    'BOOKING_TEXT_MARKERS', 'BOOKING_WORDS', 'ACMEBOOK_DOMAINS', 'ACMEBOOK_TEXT_MARKER', 'ACMEBOOK_FOOTER', 'POINTS',
    'HOT_MIN_SCORE', 'WARM_MIN_SCORE', 'FEEDBACK_ASK', 'OPENERS', 'SENDER_NAME', 'POSTAL_ADDRESS', 'SEND_TIMEZONE',
    'EMAIL_SUBJECT', 'EMAIL_BODY'];
  for (const name of needed) assert.ok(name in product, name);
  const config = require('../src/config');
  for (const name of needed) assert.ok(!(name in config), `${name} is still in config.js`);
  assert.equal(config.LEADS_TABLE, `${product.TABLE_PREFIX}_leads`);
  assert.equal(config.CITIES_TABLE, `${product.TABLE_PREFIX}_cities`);
});
