const test = require('node:test');
const assert = require('node:assert/strict');
const { toSheetRow, findNewSheetRows, buildCheckboxRequest } = require('../src/sheet_rows');

function makeLead(osmKey, score, extra = {}) {
  return { osm_key: osmKey, name: `Salon ${osmKey}`, city: 'Tampa', tier: 'Hot', score, email: 'a@b.com',
    phone: '+1 813 555 0100', opener: 'Hi there', status: 'New', ...extra };
}

test('a lead becomes a sheet row with the exact headers, unticked and unsent', () => {
  assert.deepEqual(toSheetRow(makeLead('node/1', 75)), {
    'Name': 'Salon node/1', 'City': 'Tampa', 'Tier': 'Hot', 'Score': 75, 'Lead email': 'a@b.com',
    'Contact number': '+1 813 555 0100', 'Opener': 'Hi there', 'Send email': false, 'Sent date': '',
    'Status': 'New', 'Lead ID': 'node/1',
  });
});

test('missing email, phone, opener and status become empty text and New', () => {
  const row = toSheetRow(makeLead('node/2', 10, { email: null, phone: undefined, opener: '', status: '' }));
  assert.equal(row['Lead email'], '');
  assert.equal(row['Contact number'], '');
  assert.equal(row['Opener'], '');
  assert.equal(row['Status'], 'New');
});

test('only leads not yet in the sheet are returned, highest score first', () => {
  const leads = [makeLead('node/1', 40), makeLead('node/2', 90), makeLead('node/3', 60), {}];
  const sheetRows = [{ 'Lead ID': 'node/3' }, {}];
  assert.deepEqual(findNewSheetRows(leads, sheetRows).map((row) => row['Lead ID']), ['node/2', 'node/1']);
});

test('the checkbox request puts checkbox validation on Send email (column H) for rows 2..rowCount', () => {
  assert.deepEqual(buildCheckboxRequest(89, 0), { requests: [{ setDataValidation: {
    range: { sheetId: 0, startRowIndex: 1, endRowIndex: 89, startColumnIndex: 7, endColumnIndex: 8 },
    rule: { condition: { type: 'BOOLEAN' }, strict: true },
  } }] });
});
