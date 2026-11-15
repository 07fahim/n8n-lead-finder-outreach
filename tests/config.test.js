const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CITIES, CATEGORY_RULES, BOOKING_TOOLS, LEAD_COLUMNS, CITY_COLUMNS, OVERPASS_REQUEST_TIMEOUT_SECONDS,
  OVERPASS_SERVER_TIMEOUT_SECONDS,
} = require('../src/config');

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
