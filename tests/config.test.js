const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  LEAD_COLUMNS, CITY_COLUMNS, OVERPASS_REQUEST_TIMEOUT_SECONDS, OVERPASS_SERVER_TIMEOUT_SECONDS,
} = require('../src/config');
const product = require('../src/product');
const { CITIES, CATEGORY_RULES, COMPETITOR_TOOLS } = product;

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
  for (const tool of COMPETITOR_TOOLS) {
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
  const needed = ['PRODUCT_NAME', 'TABLE_PREFIX', 'CITIES', 'CATEGORY_RULES', 'BARBERSHOP_CATEGORY', 'COMPETITOR_TOOLS',
    'COMPETITOR_TEXT_MARKERS', 'ACTION_WORDS', 'OWN_PRODUCT_DOMAINS', 'OWN_PRODUCT_TEXT_MARKER', 'OWN_PRODUCT_FOOTER',
    'POINTS', 'REASON_TEXTS', 'HOT_MIN_SCORE', 'WARM_MIN_SCORE', 'FEEDBACK_ASK', 'OPENERS', 'SENDER_NAME',
    'POSTAL_ADDRESS', 'SEND_TIMEZONE', 'EMAIL_SUBJECT', 'EMAIL_BODY'];
  for (const name of needed) assert.ok(name in product, name);
  const config = require('../src/config');
  for (const name of needed) assert.ok(!(name in config), `${name} is still in config.js`);
  assert.equal(config.LEADS_TABLE, `${product.TABLE_PREFIX}_leads`);
  assert.equal(config.CITIES_TABLE, `${product.TABLE_PREFIX}_cities`);
});

test('only src/product.js names the example product', () => {
  const sourceFolder = path.join(__dirname, '..', 'src');
  for (const fileName of fs.readdirSync(sourceFolder)) {
    if (fileName === 'product.js') continue;
    const source = fs.readFileSync(path.join(sourceFolder, fileName), 'utf8');
    assert.doesNotMatch(source, /acmebook|alex/i, fileName);
  }
});
