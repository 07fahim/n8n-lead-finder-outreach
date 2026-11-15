const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSheetSyncWorkflow, buildSenderWorkflow, buildReplyCheckerWorkflow } = require('../build_outreach');
const { connectNodes } = require('../build_nodes');
const { buildWorkflow } = require('../build');
const { runNodeLikeN8n } = require('./run_node_like_n8n');

// the same ids as in install.test.js, so the build never reads this PC's install.json
const INSTALL = { sheetId: 'sheet-123', sheetTabGid: 7, gmailCredential: { id: 'g1', name: 'Gmail' },
  sheetsCredential: { id: 's1', name: 'Sheets' } };

const AsyncFunction = (async () => {}).constructor;

function checkWiring(workflow) {
  const names = new Set(workflow.nodes.map((node) => node.name));
  for (const [source, outputs] of Object.entries(workflow.connections)) {
    assert.ok(names.has(source), source);
    for (const target of outputs.main.flat()) assert.ok(names.has(target.node), target.node);
  }
  for (const node of workflow.nodes.filter((candidate) => candidate.type === 'n8n-nodes-base.code')) {
    assert.doesNotThrow(() => new AsyncFunction('$input', '$', node.parameters.jsCode), node.name);
  }
}

const findNode = (workflow, name) => workflow.nodes.find((node) => node.name === name);

test('sheet sync is wired, has its fixed id, and writes RAW', () => {
  const workflow = buildSheetSyncWorkflow(INSTALL);
  checkWiring(workflow);
  assert.equal(workflow.id, 'AcmeBookSheetSyn');
  assert.equal(findNode(workflow, 'Add Rows').parameters.options.cellFormat, 'RAW');
  assert.equal(findNode(workflow, 'Add Rows').parameters.columns.mappingMode, 'autoMapInputData');
  assert.deepEqual(workflow.connections['Called by Lead Finder'].main[0],
    [{ node: 'Read Leads', type: 'main', index: 0 }]);
});

test('the Find New Rows node returns only leads missing from the sheet, in the sandbox', async () => {
  const leads = [{ osm_key: 'node/1', score: 40 }, { osm_key: 'node/2', score: 80 }].map((json) => ({ json }));
  const sheet = [{ json: { 'Lead ID': 'node/1' } }];
  const rows = await runNodeLikeN8n(buildSheetSyncWorkflow(INSTALL), 'Find New Rows', sheet,
    { nodeOutputs: { 'Read Leads': leads, 'Read Sheet': sheet } });
  assert.deepEqual(rows.map((item) => item.json['Lead ID']), ['node/2']);
});

test('sheet sync adds checkboxes from Read Sheet, below the Add Rows branch, through the Sheets API', () => {
  const workflow = buildSheetSyncWorkflow(INSTALL);
  assert.deepEqual(workflow.connections['Read Sheet'].main[0].map((link) => link.node),
    ['Find New Rows', 'Checkbox Range']);
  assert.equal(workflow.connections['Add Rows'], undefined);
  assert.deepEqual(workflow.connections['Checkbox Range'].main[0],
    [{ node: 'Add Checkboxes', type: 'main', index: 0 }]);
  assert.ok(findNode(workflow, 'Checkbox Range').position[1] > findNode(workflow, 'Find New Rows').position[1]);
  assert.equal(findNode(workflow, 'Checkbox Range').executeOnce, undefined);
  const request = findNode(workflow, 'Add Checkboxes');
  assert.equal(request.parameters.nodeCredentialType, 'googleSheetsOAuth2Api');
  assert.equal(request.parameters.method, 'POST');
  assert.match(request.parameters.url, /:batchUpdate$/);
  assert.deepEqual(request.credentials, { googleSheetsOAuth2Api: INSTALL.sheetsCredential });
});

async function checkboxEndRow(sheetRows, newCount) {
  const sheet = sheetRows.map((json) => ({ json }));
  const added = Array.from({ length: newCount }, () => ({ json: {} }));
  const result = await runNodeLikeN8n(buildSheetSyncWorkflow(INSTALL), 'Checkbox Range', sheet,
    { nodeOutputs: { 'Read Sheet': sheet, 'Find New Rows': added } });
  assert.equal(result.length, 1);
  // the node runs in another vm realm, so compare plain copies
  return JSON.parse(JSON.stringify(result[0].json)).requests[0].setDataValidation.range.endRowIndex;
}

test('the Checkbox Range node ends at the last sheet row plus the new rows, in the sandbox', async () => {
  assert.equal(await checkboxEndRow([{ 'Lead ID': 'node/1', row_number: 2 }, { 'Lead ID': 'node/2', row_number: 3 }],
    3), 6);
  // a blank row 3 still counts, since Add Rows appends below the last non-empty row
  assert.equal(await checkboxEndRow([{ 'Lead ID': 'node/1', row_number: 2 }, { 'Lead ID': 'node/2', row_number: 4 }],
    3), 7);
  // an empty sheet gives one empty item, from alwaysOutputData
  assert.equal(await checkboxEndRow([{}], 3), 4);
});

test('the Lead Finder calls sheet sync after Check Run and keeps going if it fails', () => {
  const workflow = buildWorkflow();
  const sync = findNode(workflow, 'Sync Sheet');
  assert.equal(sync.parameters.workflowId, 'AcmeBookSheetSyn');
  assert.equal(sync.onError, 'continueRegularOutput');
  assert.equal(sync.typeVersion, 1);
  assert.equal(sync.parameters.source, 'database');
  assert.deepEqual(workflow.connections['Check Run'].main[0], [{ node: 'Sync Sheet', type: 'main', index: 0 }]);
});

test('connectNodes puts a numbered output in its own slot', () => {
  assert.deepEqual(connectNodes([['A', 'B', 1]]), { A: { main: [[], [{ node: 'B', type: 'main', index: 0 }]] } });
});

test('sender claims the row, sends plain text without the n8n credit line, and loops with a random wait', () => {
  const workflow = buildSenderWorkflow(INSTALL);
  checkWiring(workflow);
  assert.equal(workflow.id, 'AcmeBookSender01');
  const send = findNode(workflow, 'Send Email');
  assert.equal(send.parameters.emailType, 'text');
  assert.equal(send.parameters.options.appendAttribution, false);
  assert.equal(send.parameters.options.senderName, 'Alex');
  assert.equal(send.onError, 'continueErrorOutput');
  // the input of Send Email is the Claim Row output, so the email comes from the loop item
  assert.equal(send.parameters.sendTo, "={{ $('Send One by One').item.json.to }}");
  assert.equal(send.parameters.subject, "={{ $('Send One by One').item.json.subject }}");
  assert.equal(send.parameters.message, "={{ $('Send One by One').item.json.text }}");
  assert.equal(findNode(workflow, 'Mark Sheet Sent'), undefined);
  for (const name of ['Claim Row', 'Release Row']) {
    const node = findNode(workflow, name);
    assert.equal(node.parameters.options.cellFormat, 'RAW', name);
    assert.deepEqual(node.parameters.columns.matchingColumns, ['Lead ID'], name);
    // a deleted sheet row returns [] from the update; the loop must still go on
    assert.equal(node.alwaysOutputData, true, name);
  }
  assert.equal(findNode(workflow, 'Claim Row').parameters.columns.value.Status, 'Sent');
  const release = findNode(workflow, 'Release Row');
  assert.equal(release.parameters.columns.value.Status, 'New');
  assert.equal(release.parameters.columns.value['Sent date'], '');
  assert.equal(release.onError, undefined);
  const tableFilter = findNode(workflow, 'Mark Table Sent').parameters.filters.conditions[0];
  assert.equal(tableFilter.keyName, 'osm_key');
  assert.ok(tableFilter.keyValue.includes("$('Send One by One').item.json.leadId"));
  assert.match(findNode(workflow, 'Wait').parameters.amount, /Math\.random\(\) \* 121\) \+ 60/);
  const link = (node) => [{ node, type: 'main', index: 0 }];
  assert.deepEqual(workflow.connections['Send One by One'].main[0], link('Report'));
  assert.deepEqual(workflow.connections['Send One by One'].main[1], link('Claim Row'));
  assert.deepEqual(workflow.connections['Claim Row'].main[0], link('Send Email'));
  assert.deepEqual(workflow.connections['Send Email'].main[0], link('Mark Table Sent'));
  assert.deepEqual(workflow.connections['Send Email'].main[1], link('Release Row'));
  assert.deepEqual(workflow.connections['Release Row'].main[0], link('Send One by One'));
  assert.deepEqual(workflow.connections['Mark Table Sent'].main[0], link('Wait'));
  assert.deepEqual(workflow.connections['Wait'].main[0], link('Send One by One'));
});

test('the Pick Emails node stops with the POSTAL_ADDRESS error while the address is empty, in the sandbox',
  async () => {
    // picking itself is tested in pick_rows_to_send.test.js
    const rows = [{ 'Name': 'A', 'Lead email': 'a@a.com', 'Opener': 'Hi A', 'Send email': true, 'Sent date': '',
      'Status': 'New', 'Lead ID': 'node/1' }].map((json) => ({ json }));
    await assert.rejects(runNodeLikeN8n(buildSenderWorkflow(INSTALL), 'Pick Emails', rows), /POSTAL_ADDRESS/);
  });

test('the Report node counts released rows as failed and the rest as sent, in the sandbox', async () => {
  // Wait passes the Mark Table Sent output on; Release Row returns the values it wrote
  const done = [{ id: 1, status: 'Sent' }, { 'Lead ID': 'node/2', 'Sent date': '', 'Status': 'New' }, {},
    { 'Lead ID': 'node/4', 'Sent date': '', 'Status': 'New' }].map((json) => ({ json }));
  const report = await runNodeLikeN8n(buildSenderWorkflow(INSTALL), 'Report', done);
  // the node runs in another vm realm, so compare plain copies
  assert.deepEqual(JSON.parse(JSON.stringify(report[0].json)), { sent: 2, failed: 2 });
});

test('reply checker polls Gmail every 15 minutes with full messages and writes RAW', () => {
  const workflow = buildReplyCheckerWorkflow(INSTALL);
  checkWiring(workflow);
  assert.equal(workflow.id, 'AcmeBookReplyChk');
  const trigger = findNode(workflow, 'New Email');
  assert.equal(trigger.parameters.simple, false);
  assert.deepEqual(trigger.parameters.pollTimes, { item: [{ mode: 'everyX', value: 15, unit: 'minutes' }] });
  assert.equal(findNode(workflow, 'Mark Sheet Status').parameters.options.cellFormat, 'RAW');
});

test('the Classify Replies node marks a lead reply, in the sandbox', async () => {
  const sheet = [{ json: { 'Lead email': 'owner@salon.com', 'Lead ID': 'node/1', 'Status': 'Sent',
    'Sent date': '2026-11-16' } }];
  const mail = [{ json: { from: { value: [{ address: 'owner@salon.com' }] }, text: 'stop', headers: {} } }];
  const results = await runNodeLikeN8n(buildReplyCheckerWorkflow(INSTALL), 'Classify Replies', sheet,
    { nodeOutputs: { 'New Email': mail } });
  // the node runs in another vm realm, so compare plain copies
  assert.deepEqual(JSON.parse(JSON.stringify(results.map((item) => item.json))),
    [{ leadId: 'node/1', status: 'Stopped' }]);
});

test('the Classify Replies node keeps one result per lead, the strongest, in the sandbox', async () => {
  const sheet = [{ json: { 'Lead email': 'owner@salon.com', 'Lead ID': 'node/1', 'Status': 'Sent',
    'Sent date': '2026-11-16' } }];
  const mail = [{ json: { from: { value: [{ address: 'owner@salon.com' }] }, text: 'Tell me more', headers: {} } },
    { json: { from: { value: [{ address: 'owner@salon.com' }] }, text: 'stop', headers: {} } }];
  const results = await runNodeLikeN8n(buildReplyCheckerWorkflow(INSTALL), 'Classify Replies', sheet,
    { nodeOutputs: { 'New Email': mail } });
  // the node runs in another vm realm, so compare plain copies
  assert.deepEqual(JSON.parse(JSON.stringify(results.map((item) => item.json))),
    [{ leadId: 'node/1', status: 'Stopped' }]);
});
