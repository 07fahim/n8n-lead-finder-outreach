const test = require('node:test');
const assert = require('node:assert/strict');
const nashville = require('./fixtures/overpass_nashville.json');
const manchester = require('./fixtures/overpass_manchester.json');
const { normalizeCities } = require('../src/normalize_businesses');

function makeCityResult(city, elements, overpassStatus = 'ok') {

  return { id: 1, city, country: 'UK', last_run: null, overpass_status: overpassStatus, overpass_error: '', elements };
}

test('manchester fixture: 343 found, 12 chains, 44 reachable (measured 2026-11-16)', () => {
  const [result] = normalizeCities([makeCityResult('Manchester', manchester.elements)], []);
  assert.equal(result.stats.found, 343);
  assert.equal(result.stats.chains, 12);
  assert.equal(result.stats.reachable, 44);
  assert.equal(result.businesses.length, 44 - result.stats.duplicates);
});

test('nashville fixture: 30 found, 19 reachable', () => {
  const [result] = normalizeCities([makeCityResult('Nashville', nashville.elements)], []);
  assert.equal(result.stats.found, 30);
  assert.equal(result.stats.reachable, 19);
});

test('same name and phone mapped twice is one lead; same name without phone stays two', () => {
  const elements = [
    { type: 'node', id: 1, tags: { name: 'Cut Co', shop: 'hairdresser', phone: '+44 161 000 0000' } },
    { type: 'way', id: 2, tags: { name: 'cut co', shop: 'hairdresser', phone: '+441610000000' } },
    { type: 'node', id: 3, tags: { name: 'Nails', shop: 'beauty', website: 'nails.com' } },
    { type: 'node', id: 4, tags: { name: 'Nails', shop: 'beauty', website: 'nails2.com' } },
  ];
  const [result] = normalizeCities([makeCityResult('Leeds', elements)], []);
  assert.equal(result.stats.duplicates, 1);
  assert.deepEqual(result.businesses.map((business) => business.osm_key), ['node/1', 'node/3', 'node/4']);
});

test('a phone tag with several numbers keeps the first one', () => {
  const elements = [{ type: 'node', id: 1, tags: { name: 'A', shop: 'tattoo', phone: '+44 161 1;+44 161 2' } }];
  const [result] = normalizeCities([makeCityResult('Leeds', elements)], []);
  assert.equal(result.businesses[0].phone, '+44 161 1');
});

test('already-seen businesses are counted and left out', () => {
  const elements = [{ type: 'node', id: 1, tags: { name: 'A', shop: 'tattoo', phone: '1' } }];
  const [result] = normalizeCities([makeCityResult('Leeds', elements)], ['node/1']);
  assert.equal(result.stats.already_seen, 1);
  assert.equal(result.businesses.length, 0);
});

test('fields: barbershop, https website, instagram handle, address and maps link', () => {
  const elements = [{
    type: 'node', id: 9, tags: {
      name: "Scout's Barbershop", shop: 'hairdresser', website: 'scouts.com',
      'contact:instagram': 'https://instagram.com/scouts', 'addr:housenumber': '12', 'addr:street': 'High St',
      'addr:postcode': 'M1 1AA',
    },
  }];
  const [result] = normalizeCities([makeCityResult('Manchester', elements)], []);
  const [business] = result.businesses;
  assert.equal(business.category, 'Barbershop');
  assert.equal(business.website, 'https://scouts.com');
  assert.equal(business.instagram, 'scouts');
  assert.equal(business.address, '12 High St, Manchester, M1 1AA');
  assert.ok(business.maps_link.startsWith('https://www.google.com/maps/search/?api=1&query='));
  assert.equal(business.country, 'UK');
});

test('chains and businesses with no contact are dropped; a failed city has no businesses', () => {
  const elements = [
    { type: 'node', id: 1, tags: { name: 'Chain', shop: 'hairdresser', brand: 'Supercuts', phone: '1' } },
    { type: 'node', id: 2, tags: { name: 'Quiet', shop: 'hairdresser' } },
  ];
  const [result] = normalizeCities([makeCityResult('Leeds', elements)], []);
  assert.deepEqual([result.stats.chains, result.stats.no_contact, result.businesses.length], [1, 1, 0]);
  const [failed] = normalizeCities([makeCityResult('Leeds', [], 'failed')], []);
  assert.equal(failed.overpass_status, 'failed');
  assert.equal(failed.stats.found, 0);
});
