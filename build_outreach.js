const { buildTableReference, buildNode, buildCodeNode, connectNodes } = require('./build_nodes');
const { LEADS_TABLE, SHEET_ID, SHEET_TAB, SHEETS_CREDENTIAL, WORKFLOW_IDS } = require('./src/config');

const SHEETS = { type: 'n8n-nodes-base.googleSheets', typeVersion: 4.7 };
const SETTINGS = { executionOrder: 'v1', saveManualExecutions: true };

function buildSheetReference() {

  return {
    documentId: { __rl: true, mode: 'id', value: SHEET_ID },
    sheetName: { __rl: true, mode: 'name', value: SHEET_TAB },
  };
}


function withCredential(node, credentialType, credential) {

  // an empty id means setup is not done yet; the node then asks for a credential in the editor
  if (!credential.id) return node;
  return { ...node, credentials: { [credentialType]: { id: credential.id, name: credential.name } } };
}


function sheetColumns(values, matchingColumns) {

  const schema = Object.keys(values).map((header) => ({ id: header, displayName: header, required: false,
    defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }));
  return { mappingMode: 'defineBelow', value: values, matchingColumns, schema, attemptToConvertTypes: false,
    convertFieldsToString: false };
}


function buildSheetNode(name, position, parameters, extra = {}) {

  const node = buildNode({ name, ...SHEETS, position, parameters: { resource: 'sheet', ...buildSheetReference(),
    ...parameters }, extra });
  return withCredential(node, 'googleSheetsOAuth2Api', SHEETS_CREDENTIAL);
}


function buildSheetSyncWorkflow() {

  const nodes = [
    buildNode({ name: 'Run manually', type: 'n8n-nodes-base.manualTrigger', position: [0, 0], parameters: {} }),
    buildNode({ name: 'Called by Lead Finder', type: 'n8n-nodes-base.executeWorkflowTrigger', position: [0, 200],
      parameters: {} }),
    buildNode({ name: 'Read Leads', type: 'n8n-nodes-base.dataTable', position: [220, 100], parameters: {
      resource: 'row', operation: 'get', dataTableId: buildTableReference(LEADS_TABLE), returnAll: true },
    extra: { executeOnce: true } }),

    // an empty sheet returns no items, which would stop the run; one empty item keeps it going
    buildSheetNode('Read Sheet', [440, 100], { operation: 'read', options: {} },
      { executeOnce: true, alwaysOutputData: true }),
    buildCodeNode({ name: 'Find New Rows', files: ['config.js', 'sheet_rows.js'], position: [660, 100], glue: [
      "const leads = $('Read Leads').all().map((item) => item.json);",
      "const sheetRows = $('Read Sheet').all().map((item) => item.json);",
      'return findNewSheetRows(leads, sheetRows).map((json) => ({ json }));',
    ].join('\n') }),
    buildSheetNode('Add Rows', [880, 100], { operation: 'append',
      columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] },
      options: { cellFormat: 'RAW' } }),
  ];
  const connections = connectNodes([
    ['Run manually', 'Read Leads'],
    ['Called by Lead Finder', 'Read Leads'],
    ['Read Leads', 'Read Sheet'],
    ['Read Sheet', 'Find New Rows'],
    ['Find New Rows', 'Add Rows'],
  ]);
  return { id: WORKFLOW_IDS.sheetSync, name: 'AcmeBook Sheet Sync', nodes, connections, settings: SETTINGS,
    active: false };
}

module.exports = { buildSheetSyncWorkflow, buildSheetReference, withCredential, sheetColumns, buildSheetNode,
  SETTINGS };
