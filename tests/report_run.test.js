const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCityReports, summarizeRun } = require('../src/report_run');

const NOW = '2026-11-16T10:00:00.000Z';
const STATS = { found: 30, chains: 0, no_contact: 11, reachable: 19, duplicates: 1, already_seen: 0 };

function makeCity(name, overpassStatus, stats = STATS) {
  return { id: name.length, city: name, country: 'US', last_run: '2026-11-01T00:00:00.000Z',
    overpass_status: overpassStatus, overpass_error: overpassStatus === 'ok' ? '' : 'overpass-api.de: HTTP 502',
    stats, businesses: [] };
}

test('an ok city gets this run time and its lead counts', () => {
  const leads = [
    { city: 'Nashville', country: 'US', booking_status: 'none_found', tier: 'Warm' },
    { city: 'Nashville', country: 'US', booking_status: 'competitor', tier: 'Cold' },
    { city: 'Nashville', country: 'UK', booking_status: 'no_website', tier: 'Hot' },
  ];
  const [report] = buildCityReports([makeCity('Nashville', 'ok')], leads, NOW);
  assert.equal(report.last_run, NOW);
  assert.equal(report.last_status, 'ok');
  assert.equal(report.last_leads, 2);
  assert.deepEqual([report.none_found, report.competitor, report.warm, report.cold], [1, 1, 1, 1]);
  assert.equal(report.reachable, 19);
});

test('a failed city keeps its old run time so it is picked again', () => {
  const [report] = buildCityReports([makeCity('Tampa', 'failed')], [], NOW);
  assert.equal(report.last_run, '2026-11-01T00:00:00.000Z');
  assert.equal(report.last_status, 'failed: overpass-api.de: HTTP 502');
});

test('a city with fewer than 5 reachable businesses is flagged thin', () => {
  const [report] = buildCityReports([makeCity('Tiny', 'ok', { ...STATS, reachable: 3 })], [], NOW);
  assert.equal(report.last_status, 'ok, thin city');
});

test('the run fails only when every city failed', () => {
  const reports = buildCityReports([makeCity('Tampa', 'failed'), makeCity('Nashville', 'ok')], [], NOW);
  assert.deepEqual(summarizeRun(reports), { cities: 2, failed: 1, saved: 0, hot: 0, warm: 0, cold: 0 });
  const leads = [{ city: 'Nashville', country: 'US', booking_status: 'no_website', tier: 'Hot' },
    { city: 'Nashville', country: 'US', booking_status: 'site_down', tier: 'Cold' }];
  const withLeads = buildCityReports([makeCity('Tampa', 'failed'), makeCity('Nashville', 'ok')], leads, NOW);
  assert.deepEqual(summarizeRun(withLeads), { cities: 2, failed: 1, saved: 2, hot: 1, warm: 0, cold: 1 });
  const allFailed = buildCityReports([makeCity('Tampa', 'failed')], [], NOW);
  assert.throws(() => summarizeRun(allFailed), /every city failed Overpass: Tampa/);
});
