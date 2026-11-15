const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readInstallSettings } = require('../install');
const { buildSheetSyncWorkflow, buildSenderWorkflow } = require('../build_outreach');

const EXAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'install.example.json'), 'utf8'));

function makeInstallFolder(installText) {

  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'install-'));
  fs.copyFileSync(path.join(__dirname, '..', 'install.example.json'), path.join(folder, 'install.example.json'));
  fs.writeFileSync(path.join(folder, 'install.json'), installText);
  return folder;
}

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
  const folder = makeInstallFolder(JSON.stringify({ ...EXAMPLE, sheetId: 'sheet-123' }));
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

test('a key left out of install.json falls back to the empty example', () => {
  const settings = readInstallSettings(makeInstallFolder(JSON.stringify({ sheetId: 'sheet-123' })));
  assert.equal(settings.sheetId, 'sheet-123');
  assert.equal(settings.sheetTabGid, 0);
  assert.deepEqual(settings.gmailCredential, EXAMPLE.gmailCredential);
  assert.deepEqual(settings.sheetsCredential, EXAMPLE.sheetsCredential);
  assert.doesNotThrow(() => buildSheetSyncWorkflow(settings));
});

test('an install.json saved with a byte order mark is read', () => {
  const folder = makeInstallFolder('\uFEFF' + JSON.stringify({ ...EXAMPLE, sheetId: 'sheet-123' }));
  assert.equal(readInstallSettings(folder).sheetId, 'sheet-123');
});

test('broken JSON in install.json names the file', () => {
  assert.throws(() => readInstallSettings(makeInstallFolder('{ "sheetId": ')), /install\.json/);
});

test('a sheetTabGid that is not a whole number names install.json', () => {
  const folder = makeInstallFolder(JSON.stringify({ ...EXAMPLE, sheetTabGid: 'abc' }));
  assert.throws(() => readInstallSettings(folder), /install\.json/);
});
