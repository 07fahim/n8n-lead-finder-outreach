const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSheetSyncWorkflow } = require('../build_outreach');
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
  assert.deepEqual(workflow.connections['Check Run'].main[0], [{ node: 'Sync Sheet', type: 'main', index: 0 }]);
});
