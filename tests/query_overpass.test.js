const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOverpassQuery, queryCity } = require('../src/query_overpass');

const CITY = { id: 7, city: 'Nashville', country: 'US', lat: 36.1627, lon: -86.7816, last_run: null };

function makeFakeNetwork(responses, requestSeconds = 1) {
  const clock = { milliseconds: 0 };
  const calls = [];
  const sleeps = [];
  return {
    calls,
    sleeps,
    clock,
    now: () => clock.milliseconds,
    sleep: async (seconds) => {
      sleeps.push(seconds);
      clock.milliseconds += seconds * 1000;
    },
    httpRequest: async (options) => {
      calls.push(options.url);
      clock.milliseconds += requestSeconds * 1000;
      const response = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

const OK_BODY = JSON.stringify({ elements: [{ type: 'node', id: 1, tags: { name: 'A' } }] });

test('the query covers every category around the centre with the document limits', () => {
  const query = buildOverpassQuery(36.1627, -86.7816);
  assert.ok(query.startsWith('[out:json][timeout:170];'));
  assert.ok(query.includes('nwr(around:4000,36.1627,-86.7816)["shop"~"^(hairdresser|beauty|pet_grooming|massage|tattoo|photo)$"]["name"];'));
  assert.ok(query.includes('["amenity"~"^(dentist|veterinary|driving_school)$"]["name"];'));
  assert.ok(query.includes('["healthcare"~"^(dentist|physiotherapist|chiropractor|psychotherapist)$"]["name"];'));
  assert.ok(query.includes('["leisure"~"^(spa)$"]["name"];'));
  assert.ok(query.includes('["craft"~"^(photographer)$"]["name"];'));
  assert.ok(query.endsWith('out center tags 400;'));
});

test('a good first answer returns the elements with the city fields', async () => {
  const network = makeFakeNetwork([{ statusCode: 200, body: OK_BODY }]);
  const result = await queryCity(CITY, network.httpRequest, network.sleep, network.now);
  assert.equal(result.overpass_status, 'ok');
  assert.equal(result.elements.length, 1);
  assert.equal(result.id, 7);
  assert.deepEqual(network.sleeps, []);
});

test('a busy server is retried on the next server after a wait', async () => {
  const network = makeFakeNetwork([{ statusCode: 502, body: 'at capacity' }, { statusCode: 200, body: OK_BODY }]);
  const result = await queryCity(CITY, network.httpRequest, network.sleep, network.now);
  assert.equal(result.overpass_status, 'ok');
  assert.deepEqual(network.calls, ['https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter']);
  assert.deepEqual(network.sleeps, [15]);
});

test('an HTML error page with status 200 and a timeout remark both count as failures', async () => {
  const remark = JSON.stringify({ elements: [], remark: 'runtime error: Query timed out in "query"' });
  const network = makeFakeNetwork([{ statusCode: 200, body: '<html>busy</html>' }, { statusCode: 200, body: remark },
    new Error('timeout of 180000ms exceeded'), { statusCode: 504, body: '' }]);
  const result = await queryCity(CITY, network.httpRequest, network.sleep, network.now);
  assert.equal(result.overpass_status, 'failed');
  assert.deepEqual(result.elements, []);
  assert.match(result.overpass_error, /not JSON/);
  assert.match(result.overpass_error, /timed out/);
});

test('retries stop before the city budget of 420 s is passed', async () => {
  const network = makeFakeNetwork([{ statusCode: 502, body: '' }], 180);
  const result = await queryCity(CITY, network.httpRequest, network.sleep, network.now);
  assert.equal(result.overpass_status, 'failed');
  assert.equal(network.calls.length, 2);
  assert.deepEqual(network.sleeps, [15]);
  assert.ok(network.clock.milliseconds <= 420 * 1000);
});
