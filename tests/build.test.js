const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWorkflow, buildCityRows, inlineSources } = require('../build');
const { runNodeLikeN8n } = require('./run_node_like_n8n');

const AsyncFunction = (async () => {}).constructor;

test('inlined sources have no require or module.exports left', () => {
  const code = inlineSources(['config.js', 'read_contacts.js', 'normalize_businesses.js']);
  assert.ok(!code.includes('require('));
  assert.ok(!code.includes('module.exports'));
});

test('every Code node compiles as an n8n Code node body', () => {
  const workflow = buildWorkflow();
  const codeNodes = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.code');
  assert.equal(codeNodes.length, 6);
  for (const node of codeNodes) {
    assert.doesNotThrow(() => new AsyncFunction('$input', '$', node.parameters.jsCode), node.name);
  }
});

test('every connection points at an existing node and the report branch sits below the leads branch', () => {
  const workflow = buildWorkflow();
  const names = new Set(workflow.nodes.map((node) => node.name));
  for (const [source, outputs] of Object.entries(workflow.connections)) {
    assert.ok(names.has(source), source);
    for (const target of outputs.main.flat()) assert.ok(names.has(target.node), target.node);
  }
  const position = (name) => workflow.nodes.find((node) => node.name === name).position;
  assert.ok(position('Check Websites')[1] < position('Run Report')[1]);
  assert.equal(workflow.settings.executionOrder, 'v1');
});

test('city rows keep list order and start never-run', () => {
  const rows = buildCityRows();
  assert.equal(rows.length, 43);
  assert.deepEqual(rows[0], { city: 'Nashville', country: 'US', lat: 36.1627, lon: -86.7816, list_order: 1,
    last_status: '', last_leads: 0 });
});

test('the Query Overpass node runs where URL is not a global', async () => {
  const refused = async () => {
    throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
  };
  const city = { id: 1, city: 'Leeds', country: 'UK', lat: 53.8, lon: -1.55, last_run: null };
  const [result] = await runNodeLikeN8n(buildWorkflow(), 'Query Overpass', [{ json: city }], { httpRequest: refused });
  assert.equal(result.json.overpass_status, 'failed');
  assert.match(result.json.overpass_error, /overpass-api\.de: refused/);
});


test('the Check Websites node runs where URL is not a global', async () => {
  const business = { osm_key: 'node/1', name: 'Salon', category: 'Hair Salon', country: 'UK', city: 'Leeds',
    phone: '1', email: '', website: 'https://salon.com', instagram: '', address: 'Leeds', maps_link: 'm' };
  const pages = { 'https://salon.com': '<a href="https://bookme.newtool.io/x">Book now</a>' };
  const httpRequest = async (options) => ({ statusCode: 200, body: pages[options.url] });
  const leads = await runNodeLikeN8n(buildWorkflow(), 'Check Websites', [{ json: { businesses: [business] } }],
    { httpRequest });
  assert.equal(leads[0].json.tool_name, 'bookme.newtool.io');
});
