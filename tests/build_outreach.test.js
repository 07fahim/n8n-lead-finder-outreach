const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSheetSyncWorkflow, buildSenderWorkflow, buildReplyCheckerWorkflow } = require('../build_outreach');
const { connectNodes } = require('../build_nodes');
const { buildWorkflow } = require('../build');
const { runNodeLikeN8n } = require('./run_node_like_n8n');

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
  const workflow = buildSheetSyncWorkflow();
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
  const rows = await runNodeLikeN8n(buildSheetSyncWorkflow(), 'Find New Rows', sheet,
    { nodeOutputs: { 'Read Leads': leads, 'Read Sheet': sheet } });
  assert.deepEqual(rows.map((item) => item.json['Lead ID']), ['node/2']);
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

test('sender sends plain text without the n8n credit line, marks RAW, and loops with a random wait', () => {
  const workflow = buildSenderWorkflow();
  checkWiring(workflow);
  assert.equal(workflow.id, 'AcmeBookSender01');
  const send = findNode(workflow, 'Send Email');
  assert.equal(send.parameters.emailType, 'text');
  assert.equal(send.parameters.options.appendAttribution, false);
  assert.equal(send.parameters.options.senderName, 'Alex');
  assert.equal(send.onError, 'continueErrorOutput');
  assert.equal(findNode(workflow, 'Mark Sheet Sent').parameters.options.cellFormat, 'RAW');
  // a deleted sheet row returns [] from the update; the loop must still reach Wait
  assert.equal(findNode(workflow, 'Mark Sheet Sent').alwaysOutputData, true);
  assert.deepEqual(findNode(workflow, 'Mark Sheet Sent').parameters.columns.matchingColumns, ['Lead ID']);
  const tableFilter = findNode(workflow, 'Mark Table Sent').parameters.filters.conditions[0];
  assert.equal(tableFilter.keyName, 'osm_key');
  assert.ok(tableFilter.keyValue.includes("$('Send One by One').item.json.leadId"));
  assert.match(findNode(workflow, 'Wait').parameters.amount, /Math\.random\(\) \* 121\) \+ 60/);
  assert.deepEqual(workflow.connections['Send Email'].main[1], [{ node: 'Send One by One', type: 'main', index: 0 }]);
  assert.deepEqual(workflow.connections['Wait'].main[0], [{ node: 'Send One by One', type: 'main', index: 0 }]);
  assert.deepEqual(workflow.connections['Send One by One'].main[0], [{ node: 'Report', type: 'main', index: 0 }]);
});

test('the Pick Emails node builds emails for ticked rows only, in the sandbox', async () => {
  const rows = [
    { 'Name': 'A', 'Lead email': 'a@a.com', 'Opener': 'Hi A', 'Send email': true, 'Sent date': '', 'Status': 'New',
      'Lead ID': 'node/1' },
    { 'Name': 'B', 'Lead email': 'b@b.com', 'Opener': 'Hi B', 'Send email': false, 'Sent date': '', 'Status': 'New',
      'Lead ID': 'node/2' },
  ].map((json) => ({ json }));
  const emails = await runNodeLikeN8n(buildSenderWorkflow(), 'Pick Emails', rows);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].json.to, 'a@a.com');
  assert.match(emails[0].json.sentDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('the Report node counts sent and failed emails from the loop done output, in the sandbox', async () => {
  // Gmail's error output carries the error as a plain string, e.g. 'quota (item 0)'
  const done = [{ leadId: 'node/1' }, { leadId: 'node/2', error: { message: 'quota' } }, { leadId: 'node/3' },
    { leadId: 'node/4', error: 'quota (item 0)' }].map((json) => ({ json }));
  const report = await runNodeLikeN8n(buildSenderWorkflow(), 'Report', done);
  // the node runs in another vm realm, so compare plain copies
  assert.deepEqual(JSON.parse(JSON.stringify(report[0].json)),
    { sent: 2, failed: 2, errors: ['quota', 'quota (item 0)'] });
});

test('reply checker polls Gmail every 15 minutes with full messages and writes RAW', () => {
  const workflow = buildReplyCheckerWorkflow();
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
  const results = await runNodeLikeN8n(buildReplyCheckerWorkflow(), 'Classify Replies', sheet,
    { nodeOutputs: { 'New Email': mail } });
  // the node runs in another vm realm, so compare plain copies
  assert.deepEqual(JSON.parse(JSON.stringify(results.map((item) => item.json))),
    [{ leadId: 'node/1', status: 'Stopped' }]);
});
