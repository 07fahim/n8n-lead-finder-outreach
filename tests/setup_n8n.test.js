const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCreateTableRequest, buildInsertRowsRequest, buildFindTableRequest } = require('../scripts/setup_n8n');
const { buildCityRows } = require('../build');
const { LEAD_COLUMNS, CITY_COLUMNS } = require('../src/config');

test('the create-table request carries the table name and its columns from build/tables.json', () => {
  const tables = { acmebook_leads: LEAD_COLUMNS, acmebook_cities: CITY_COLUMNS };
  const request = buildCreateTableRequest('acmebook_leads', tables.acmebook_leads);
  assert.equal(request.method, 'POST');
  assert.equal(request.path, '/api/v1/data-tables');
  assert.equal(request.body.name, 'acmebook_leads');
  assert.equal(request.body.columns.length, 20);
  assert.deepEqual(request.body.columns[0], { name: 'osm_key', type: 'string' });
  assert.deepEqual(request.body.columns.at(-1), { name: 'date_found', type: 'date' });
});

test('all 43 city rows go into the new table in one insert request', () => {
  const request = buildInsertRowsRequest('table123', buildCityRows());
  assert.equal(request.method, 'POST');
  assert.equal(request.path, '/api/v1/data-tables/table123/rows');
  assert.equal(request.body.data.length, 43);
  assert.equal(request.body.data[0].city, 'Nashville');
  assert.equal(request.body.returnType, 'count');
});

test('the find-table request filters by the exact name', () => {
  const request = buildFindTableRequest('acmebook_cities');
  assert.equal(request.method, 'GET');
  assert.equal(request.path, `/api/v1/data-tables?filter=${encodeURIComponent('{"name":"acmebook_cities"}')}`);
});
