const fs = require('node:fs');
const path = require('node:path');
const { CITIES, LEADS_TABLE, CITIES_TABLE, LEAD_COLUMNS, CITY_COLUMNS } = require('./src/config');

const SOURCE_FOLDER = path.join(__dirname, 'src');
const OUTPUT_FOLDER = path.join(__dirname, 'build');
const WORKFLOW_NAME = 'AcmeBook Lead Finder';
const REQUIRE_LINE = /^const \{[^}]*\} = require\([^)]*\);\r?\n/gm;
// n8n's Code node sandbox has no global URL (execution 343, 2026-11-16); start-n8n.cmd allows the url module
const SANDBOX_PREAMBLE = "const { URL } = require('url');";

// each Code node gets config.js, the files it needs in dependency order, then the glue that n8n runs
const CODE_NODES = [
  {
    name: 'Pick Cities',
    files: ['config.js', 'pick_cities.js'],
    glue: "return pickCities($('Read Cities').all().map((item) => item.json)).map((json) => ({ json }));",
  },
  {
    name: 'Query Overpass',
    files: ['config.js', 'query_overpass.js'],
    glue: [
      'const results = [];',
      'for (const item of $input.all()) {',
      '  results.push(await queryCity(item.json, (options) => this.helpers.httpRequest(options), waitSeconds,',
      '    () => Date.now()));',
      '}',
      'return results.map((json) => ({ json }));',
    ].join('\n'),
  },
  {
    name: 'Normalize Businesses',
    files: ['config.js', 'read_contacts.js', 'normalize_businesses.js'],
    glue: [
      "const seenKeys = $('Read Seen').all().map((item) => item.json.osm_key).filter(Boolean);",
      'return normalizeCities($input.all().map((item) => item.json), seenKeys).map((json) => ({ json }));',
    ].join('\n'),
  },
  {
    name: 'Check Websites',
    files: ['config.js', 'read_contacts.js', 'detect_booking.js', 'score_lead.js', 'check_websites.js'],
    glue: [
      'const businesses = $input.all().flatMap((item) => item.json.businesses);',
      'const leads = await checkBusinesses(businesses, (options) => this.helpers.httpRequest(options),',
      '  new Date().toISOString());',
      'return leads.map((json) => ({ json }));',
    ].join('\n'),
  },
  {
    name: 'Run Report',
    files: ['config.js', 'report_run.js'],
    glue: [
      "const leads = $('Save Leads').isExecuted ? $('Check Websites').all().map((item) => item.json) : [];",
      'const cities = $input.all().map((item) => item.json);',
      'return buildCityReports(cities, leads, new Date().toISOString()).map((json) => ({ json }));',
    ].join('\n'),
  },
  {
    name: 'Check Run',
    files: ['config.js', 'report_run.js'],
    glue: "return [{ json: summarizeRun($('Run Report').all().map((item) => item.json)) }];",
  },
];

const POSITIONS = {
  'Run manually': [0, 0],
  'Read Cities': [220, 0],
  'Read Seen': [440, 0],
  'Pick Cities': [660, 0],
  'Query Overpass': [880, 0],
  'Normalize Businesses': [1100, 0],
  'Check Websites': [1320, 0],
  'Save Leads': [1540, 0],
  'Run Report': [1320, 320],
  'Mark Cities': [1540, 320],
  'Check Run': [1760, 320],
};

const CHAIN = [
  ['Run manually', 'Read Cities'],
  ['Read Cities', 'Read Seen'],
  ['Read Seen', 'Pick Cities'],
  ['Pick Cities', 'Query Overpass'],
  ['Query Overpass', 'Normalize Businesses'],
  ['Normalize Businesses', 'Check Websites'],
  ['Normalize Businesses', 'Run Report'],
  ['Check Websites', 'Save Leads'],
  ['Run Report', 'Mark Cities'],
  ['Mark Cities', 'Check Run'],
];

function inlineSources(fileNames) {

  return fileNames.map((fileName) => {
    const source = fs.readFileSync(path.join(SOURCE_FOLDER, fileName), 'utf8');
    const withoutExports = source.slice(0, source.indexOf('module.exports'));
    return withoutExports.replace(REQUIRE_LINE, '').trim();
  }).join('\n\n');
}


function buildTableReference(tableName) {

  return { __rl: true, mode: 'name', value: tableName };
}


function buildNode(name, type, parameters, extra = {}) {

  return { id: name.toLowerCase().replace(/\s+/g, '-'), name, type, typeVersion: 1, position: POSITIONS[name],
    parameters, ...extra };
}


function buildCodeNode(codeNode) {

  const jsCode = `${SANDBOX_PREAMBLE}\n\n${inlineSources(codeNode.files)}\n\n${codeNode.glue}\n`;
  return { ...buildNode(codeNode.name, 'n8n-nodes-base.code', { jsCode }), typeVersion: 2 };
}


function buildWorkflow() {

  const dataTable = 'n8n-nodes-base.dataTable';
  const readAll = (tableName) => ({ resource: 'row', operation: 'get', dataTableId: buildTableReference(tableName),
    returnAll: true });
  const nodes = [
    buildNode('Run manually', 'n8n-nodes-base.manualTrigger', {}),
    buildNode('Read Cities', dataTable, readAll(CITIES_TABLE), { executeOnce: true }),

    // an empty leads table returns no items, which would stop the run; one empty item keeps it going
    buildNode('Read Seen', dataTable, readAll(LEADS_TABLE), { executeOnce: true, alwaysOutputData: true }),
    ...CODE_NODES.map(buildCodeNode),
    buildNode('Save Leads', dataTable, { resource: 'row', operation: 'insert',
      dataTableId: buildTableReference(LEADS_TABLE), columns: { mappingMode: 'autoMapInputData', value: null } }),

    // Check Run must still run when no city row matched, so it can report the run
    buildNode('Mark Cities', dataTable, {
      resource: 'row',
      operation: 'update',
      dataTableId: buildTableReference(CITIES_TABLE),
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: '={{ $json.id }}' }] },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          last_run: '={{ $json.last_run }}',
          last_status: '={{ $json.last_status }}',
          last_leads: '={{ $json.last_leads }}',
        },
        matchingColumns: [],
        schema: [],
      },
    }, { alwaysOutputData: true }),
  ];
  const connections = {};
  for (const [source, target] of CHAIN) {
    if (!connections[source]) connections[source] = { main: [[]] };
    connections[source].main[0].push({ node: target, type: 'main', index: 0 });
  }
  return { name: WORKFLOW_NAME, nodes, connections, settings: { executionOrder: 'v1', saveManualExecutions: true } };
}


function buildCityRows() {

  return CITIES.map((city, index) => ({ ...city, list_order: index + 1, last_status: '', last_leads: 0 }));
}


function writeBuildFiles() {

  fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
  const files = {
    'workflow.json': buildWorkflow(),
    'tables.json': { [LEADS_TABLE]: LEAD_COLUMNS, [CITIES_TABLE]: CITY_COLUMNS },
    'cities.json': buildCityRows(),
  };
  for (const [fileName, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(OUTPUT_FOLDER, fileName), `${JSON.stringify(content, null, 2)}\n`);
    console.log(`wrote 'build/${fileName}'`);
  }
}



if (require.main === module) writeBuildFiles();

module.exports = { inlineSources, buildWorkflow, buildCityRows };
