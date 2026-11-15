const test = require('node:test');
const assert = require('node:assert/strict');
const { pickRowsToSend } = require('../src/pick_rows_to_send');

const TODAY = '2026-11-16';

function makeRow(leadId, extra = {}) {
  return { 'Name': `Salon ${leadId}`, 'Lead email': `${leadId}@salon.com`, 'Opener': 'Hi there',
    'Send email': true, 'Sent date': '', 'Status': 'New', 'Lead ID': leadId, ...extra };
}

const pickedIds = (rows) => rows.map((row) => row['Lead ID']);

test('ticked, unsent New rows with an email and an opener are picked in sheet order', () => {
  const rows = [makeRow('a'), makeRow('b', { 'Send email': 'TRUE' }), makeRow('c')];
  assert.deepEqual(pickedIds(pickRowsToSend(rows, TODAY, 15)), ['a', 'b', 'c']);
});

test('unticked, already sent, no email, no opener, not New or no Lead ID rows are skipped', () => {
  const rows = [
    makeRow('unticked', { 'Send email': false }),
    makeRow('sent', { 'Sent date': '2026-11-10' }),
    makeRow('no-email', { 'Lead email': '  ' }),
    makeRow('no-opener', { 'Opener': '' }),
    makeRow('stopped', { 'Status': 'Stopped' }),
    makeRow('replied', { 'Status': 'Replied' }),
    makeRow('', {}),
    makeRow('ok'),
  ];
  assert.deepEqual(pickedIds(pickRowsToSend(rows, TODAY, 15)), ['ok']);
});

test('rows already sent today count against the limit', () => {
  const rows = [makeRow('x', { 'Sent date': TODAY }), makeRow('y', { 'Sent date': TODAY }), makeRow('a'),
    makeRow('b'), makeRow('c')];
  assert.deepEqual(pickedIds(pickRowsToSend(rows, TODAY, 3)), ['a']);
  assert.deepEqual(pickRowsToSend(rows, TODAY, 2), []);
});

test('an address that was already emailed, or appears twice, is emailed once', () => {
  const rows = [makeRow('old', { 'Lead email': 'Same@Salon.com', 'Sent date': '2026-11-01', 'Status': 'Sent' }),
    makeRow('a', { 'Lead email': 'same@salon.com' }), makeRow('b', { 'Lead email': 'twin@salon.com' }),
    makeRow('c', { 'Lead email': 'TWIN@salon.com' })];
  assert.deepEqual(pickedIds(pickRowsToSend(rows, TODAY, 15)), ['b']);
});

test('a cell holding two addresses is not picked', () => {
  const rows = [makeRow('semicolon', { 'Lead email': 'a@x.com;b@y.com' }),
    makeRow('comma', { 'Lead email': 'a@x.com, b@y.com' }), makeRow('ok')];
  assert.deepEqual(pickedIds(pickRowsToSend(rows, TODAY, 15)), ['ok']);
});
