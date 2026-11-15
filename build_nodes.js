const fs = require('node:fs');
const path = require('node:path');

const SOURCE_FOLDER = path.join(__dirname, 'src');
const REQUIRE_LINE = /^const \{[^}]*\} = require\([^)]*\);\r?\n/gm;
// n8n's Code node sandbox has no global URL (execution 343, 2026-11-16); start-n8n.cmd allows the url module
const SANDBOX_PREAMBLE = "const { URL } = require('url');";

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


function buildNode({ name, type, typeVersion = 1, position, parameters, extra = {} }) {

  return { id: name.toLowerCase().replace(/\s+/g, '-'), name, type, typeVersion, position, parameters, ...extra };
}


function buildCodeNode({ name, files, glue, position, extra }) {

  const jsCode = `${SANDBOX_PREAMBLE}\n\n${inlineSources(files)}\n\n${glue}\n`;
  return buildNode({ name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { jsCode }, extra });
}


function connectNodes(links) {

  const connections = {};
  for (const [source, target, outputIndex = 0] of links) {
    if (!connections[source]) connections[source] = { main: [] };
    const outputs = connections[source].main;
    while (outputs.length <= outputIndex) outputs.push([]);
    outputs[outputIndex].push({ node: target, type: 'main', index: 0 });
  }
  return connections;
}

module.exports = { inlineSources, buildTableReference, buildNode, buildCodeNode, connectNodes };
