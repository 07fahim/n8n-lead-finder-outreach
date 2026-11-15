const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readInstallSettings } = require('../install');
const { buildSheetSyncWorkflow, buildSenderWorkflow } = require('../build_outreach');

const EXAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'install.example.json'), 'utf8'));

test('without install.json the empty example is used', (t) => {
  // the fallback warns on purpose; keep the test output clean and check it warned once
  const warn = t.mock.method(console, 'warn', () => {});
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'install-'));
  fs.copyFileSync(path.join(__dirname, '..', 'install.example.json'), path.join(folder, 'install.example.json'));
  assert.deepEqual(readInstallSettings(folder), EXAMPLE);
  assert.equal(EXAMPLE.sheetId, '');
  assert.equal(warn.mock.callCount(), 1);
});

test('install.json wins over the example', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'install-'));
  const mine = { ...EXAMPLE, sheetId: 'sheet-123' };
  fs.writeFileSync(path.join(folder, 'install.json'), JSON.stringify(mine));
  assert.equal(readInstallSettings(folder).sheetId, 'sheet-123');
});

test('the install ids reach the built workflows', () => {
  const install = { sheetId: 'sheet-123', sheetTabGid: 7, gmailCredential: { id: 'g1', name: 'Gmail' },
    sheetsCredential: { id: 's1', name: 'Sheets' } };
  const sync = buildSheetSyncWorkflow(install);
  const readSheet = sync.nodes.find((node) => node.name === 'Read Sheet');
  assert.equal(readSheet.parameters.documentId.value, 'sheet-123');
  assert.deepEqual(readSheet.credentials, { googleSheetsOAuth2Api: { id: 's1', name: 'Sheets' } });
  assert.match(sync.nodes.find((node) => node.name === 'Checkbox Range').parameters.jsCode,
    /buildCheckboxRequest\(rowCount, 7\)/);
  const send = buildSenderWorkflow(install).nodes.find((node) => node.name === 'Send Email');
  assert.deepEqual(send.credentials, { gmailOAuth2: { id: 'g1', name: 'Gmail' } });
});

test('empty ids leave the credentials for the editor', () => {
  const readSheet = buildSheetSyncWorkflow(EXAMPLE).nodes.find((node) => node.name === 'Read Sheet');
  assert.equal(readSheet.credentials, undefined);
});
