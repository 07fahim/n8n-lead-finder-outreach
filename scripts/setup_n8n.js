// creates the two Data tables and loads the cities through n8n's public API, so a new PC needs no MCP; run
// `node build.js` first, then: node scripts/setup_n8n.js [--dry-run]
const fs = require('node:fs');
const path = require('node:path');
const { CITIES_TABLE } = require('../src/config');

const BUILD_FOLDER = path.join(__dirname, '..', 'build');
const DEFAULT_N8N_URL = 'http://localhost:5678';

function buildFindTableRequest(tableName) {

  const filter = encodeURIComponent(JSON.stringify({ name: tableName }));
  return { method: 'GET', path: `/api/v1/data-tables?filter=${filter}` };
}


function buildCreateTableRequest(tableName, columns) {

  return { method: 'POST', path: '/api/v1/data-tables', body: { name: tableName, columns } };
}


function buildInsertRowsRequest(tableId, rows) {

  // n8n 2.41.5's AddDataTableRowsDto sets no maximum, so the 43 cities fit in one request
  return { method: 'POST', path: `/api/v1/data-tables/${tableId}/rows`, body: { data: rows, returnType: 'count' } };
}


function readInsertedCount(insertResult) {

  // n8n 2.41.5 answers { success, insertedRows } (insertRowsBulk); its OpenAPI file documents { count }
  return insertResult.insertedRows ?? insertResult.count;
}


async function sendRequest(n8nUrl, apiKey, request) {

  const response = await fetch(`${n8nUrl}${request.path}`, {
    method: request.method,
    headers: { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: request.body ? JSON.stringify(request.body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${request.method} ${request.path} failed [${response.status}]: ${text}`);
  return JSON.parse(text);
}


function readBuildFile(fileName) {

  const filePath = path.join(BUILD_FOLDER, fileName);
  if (!fs.existsSync(filePath)) throw new Error(`'build/${fileName}' is missing: run "node build.js" first`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}


async function setupTables(n8nUrl, apiKey, dryRun) {

  const tables = readBuildFile('tables.json');
  const cities = readBuildFile('cities.json');
  console.log(`setting up [${Object.keys(tables).length}] tables in '${n8nUrl}'${dryRun ? ' (dry run)' : ''}`);
  let createdCount = 0;
  let skippedCount = 0;
  let cityCount = 0;
  for (const [tableName, columns] of Object.entries(tables)) {
    const createRequest = buildCreateTableRequest(tableName, columns);
    if (dryRun) {
      console.log(`would ${createRequest.method} ${createRequest.path} '${tableName}' with [${columns.length}] columns`);
      if (tableName === CITIES_TABLE) {
        const insertRequest = buildInsertRowsRequest('<new table id>', cities);
        console.log(`would ${insertRequest.method} ${insertRequest.path} with [${cities.length}] rows`);
      }
      continue;
    }
    const found = await sendRequest(n8nUrl, apiKey, buildFindTableRequest(tableName));
    if (found.data.some((table) => table.name === tableName)) {
      console.log(`'${tableName}': already exists, skipped (its rows are left as they are)`);
      if (tableName === CITIES_TABLE) {
        console.log(`'${tableName}': cities were NOT loaded; if this table is empty (for example after a failed first run), delete it in n8n (Data tables) and run this script again`);
      }
      skippedCount += 1;
      continue;
    }
    const table = await sendRequest(n8nUrl, apiKey, createRequest);
    console.log(`'${tableName}': created with [${columns.length}] columns`);
    createdCount += 1;

    // cities go in only when the table is new, so a second run does not double them
    if (tableName === CITIES_TABLE) {
      const inserted = await sendRequest(n8nUrl, apiKey, buildInsertRowsRequest(table.id, cities));
      cityCount = readInsertedCount(inserted);
      console.log(`'${tableName}': inserted [${cityCount}] cities`);
    }
  }
  if (dryRun) {
    console.log('dry run: nothing was sent to n8n');
    return;
  }
  console.log(`done: created [${createdCount}] tables, skipped [${skippedCount}], inserted [${cityCount}] cities`);
}



if (require.main === module) {
  // --dry-run: print the planned requests without calling n8n (no API key needed)
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--dry-run');
  if (unknownArguments.length) {
    console.error(`unknown argument: ${unknownArguments.join(' ')} (the only option is --dry-run)`);
    process.exit(1);
  }
  const dryRun = process.argv.includes('--dry-run');
  const apiKey = process.env.N8N_API_KEY;
  if (!dryRun && !apiKey) {
    console.error('N8N_API_KEY is not set: create a key in n8n (Settings > n8n API) and set it in this terminal');
    process.exit(1);
  }
  setupTables(process.env.N8N_URL || DEFAULT_N8N_URL, apiKey, dryRun).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { buildFindTableRequest, buildCreateTableRequest, buildInsertRowsRequest, readInsertedCount };
