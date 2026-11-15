const { buildTableReference, buildNode, buildCodeNode, connectNodes } = require('./build_nodes');
const { LEADS_TABLE, SHEET_ID, SHEET_TAB, SHEETS_CREDENTIAL, WORKFLOW_IDS, LEAD_STATUS, GMAIL_CREDENTIAL,
  DAILY_SEND_LIMIT, SEND_WAIT_SECONDS } = require('./src/config');
const { PRODUCT_NAME, SENDER_NAME, SEND_TIMEZONE } = require('./src/product');

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
    buildCodeNode({ name: 'Find New Rows', files: ['product.js', 'config.js', 'sheet_rows.js'],
      position: [660, 100], glue: [
      "const leads = $('Read Leads').all().map((item) => item.json);",
      "const sheetRows = $('Read Sheet').all().map((item) => item.json);",
      'return findNewSheetRows(leads, sheetRows).map((json) => ({ json }));',
    ].join('\n') }),
    buildSheetNode('Add Rows', [880, 100], { operation: 'append',
      columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] },
      options: { cellFormat: 'RAW' } }),

    // Insert > Checkbox writes FALSE into every empty cell, so the sheet would read back as full and new rows would
    // land below the boxes; a validation rule on the filled rows writes no values. It hangs off Read Sheet, below
    // Find New Rows, so it runs on every sync (even one that adds nothing) and, under executionOrder v1, after the
    // Add Rows branch has finished
    buildCodeNode({ name: 'Checkbox Range', files: ['product.js', 'config.js', 'sheet_rows.js'],
      position: [660, 300], glue: [
      "const lastRow = Math.max(1, ...$('Read Sheet').all().map((item) => item.json.row_number || 0));",
      "const rowCount = lastRow + $('Find New Rows').all().length;",
      'return [{ json: buildCheckboxRequest(rowCount) }];',
    ].join('\n') }),
    withCredential(buildNode({ name: 'Add Checkboxes', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
      position: [880, 300], parameters: { method: 'POST',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
        authentication: 'predefinedCredentialType', nodeCredentialType: 'googleSheetsOAuth2Api',
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json) }}', options: {} } }),
    'googleSheetsOAuth2Api', SHEETS_CREDENTIAL),
  ];
  const connections = connectNodes([
    ['Run manually', 'Read Leads'],
    ['Called by Lead Finder', 'Read Leads'],
    ['Read Leads', 'Read Sheet'],
    ['Read Sheet', 'Find New Rows'],
    ['Find New Rows', 'Add Rows'],
    ['Read Sheet', 'Checkbox Range'],
    ['Checkbox Range', 'Add Checkboxes'],
  ]);
  return { id: WORKFLOW_IDS.sheetSync, name: `${PRODUCT_NAME} Sheet Sync`, nodes, connections, settings: SETTINGS,
    active: false };
}


function buildSenderWorkflow() {

  const [shortestWait, longestWait] = SEND_WAIT_SECONDS;
  const current = "$('Send One by One').item.json";
  const nodes = [
    buildNode({ name: 'Run manually', type: 'n8n-nodes-base.manualTrigger', position: [0, 0], parameters: {} }),
    buildSheetNode('Read Sheet', [220, 0], { operation: 'read', options: {} }),
    buildCodeNode({ name: 'Pick Emails', files: ['product.js', 'config.js', 'pick_rows_to_send.js', 'build_email.js'],
      position: [440, 0], glue: [
        "const today = new Date().toLocaleDateString('en-CA', { timeZone: SEND_TIMEZONE });",
        'const sheetRows = $input.all().map((item) => item.json);',
        'return pickRowsToSend(sheetRows, today, DAILY_SEND_LIMIT)',
        '  .map((row) => ({ json: { ...buildEmail(row), sentDate: today } }));',
      ].join('\n') }),
    buildNode({ name: 'Send One by One', type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, position: [660, 0],
      parameters: { batchSize: 1, options: {} } }),

    // the row is marked Sent before Gmail sends, because a mark that failed after a send would let the next run email
    // the lead again; a row the user deleted matches nothing and returns [], and without alwaysOutputData the loop
    // stops there
    buildSheetNode('Claim Row', [880, 100], { operation: 'update', columns: sheetColumns({
      'Lead ID': `={{ ${current}.leadId }}`,
      'Sent date': `={{ ${current}.sentDate }}`,
      'Status': LEAD_STATUS.sent,
    }, ['Lead ID']), options: { cellFormat: 'RAW' } }, { alwaysOutputData: true }),

    // its input is the Claim Row output, so the email is read from the loop item
    withCredential(buildNode({ name: 'Send Email', type: 'n8n-nodes-base.gmail', typeVersion: 2.2,
      position: [1100, 100], parameters: { resource: 'message', operation: 'send', sendTo: `={{ ${current}.to }}`,
        subject: `={{ ${current}.subject }}`, emailType: 'text', message: `={{ ${current}.text }}`,
        options: { appendAttribution: false, senderName: SENDER_NAME } },

      // one failed send must not stop the others; Release Row hands the row back to the next run
      extra: { onError: 'continueErrorOutput' } }), 'gmailOAuth2', GMAIL_CREDENTIAL),

    // onError stays at the default: if releasing fails, the row stays claimed, which is the safe direction (the lead is
    // never emailed twice), and the run stops so the problem is seen. Report counts Status New as a failure
    buildSheetNode('Release Row', [1320, 300], { operation: 'update', columns: sheetColumns({
      'Lead ID': `={{ ${current}.leadId }}`,
      'Sent date': '',
      'Status': LEAD_STATUS.new,
    }, ['Lead ID']), options: { cellFormat: 'RAW' } }, { alwaysOutputData: true }),
    buildNode({ name: 'Mark Table Sent', type: 'n8n-nodes-base.dataTable', position: [1320, 0], parameters: {
      resource: 'row', operation: 'update', dataTableId: buildTableReference(LEADS_TABLE), matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'osm_key', condition: 'eq', keyValue: `={{ ${current}.leadId }}` }] },
      columns: { mappingMode: 'defineBelow', value: { status: LEAD_STATUS.sent }, matchingColumns: [], schema: [] },
    }, extra: { alwaysOutputData: true } }),
    buildNode({ name: 'Wait', type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: [1540, 0], parameters: {
      resume: 'timeInterval', unit: 'seconds',
      amount: `={{ Math.floor(Math.random() * ${longestWait - shortestWait + 1}) + ${shortestWait} }}` } }),

    // the loop's done output holds every item fed back: sends from Wait, failures from Release Row, which returns the
    // values it wrote (Status New); the Gmail error text is in the execution view
    buildCodeNode({ name: 'Report', files: [], position: [880, -200], glue: [
      'const results = $input.all().map((item) => item.json);',
      `const failed = results.filter((json) => json.Status === '${LEAD_STATUS.new}').length;`,
      'return [{ json: { sent: results.length - failed, failed } }];',
    ].join('\n') }),
  ];
  const connections = connectNodes([
    ['Run manually', 'Read Sheet'],
    ['Read Sheet', 'Pick Emails'],
    ['Pick Emails', 'Send One by One'],
    ['Send One by One', 'Report', 0],
    ['Send One by One', 'Claim Row', 1],
    ['Claim Row', 'Send Email'],
    ['Send Email', 'Mark Table Sent', 0],
    ['Send Email', 'Release Row', 1],
    ['Release Row', 'Send One by One'],
    ['Mark Table Sent', 'Wait'],
    ['Wait', 'Send One by One'],
  ]);
  return { id: WORKFLOW_IDS.sender, name: `${PRODUCT_NAME} Sender`, nodes, connections, settings: SETTINGS,
    active: false };
}


function buildReplyCheckerWorkflow() {

  const nodes = [
    withCredential(buildNode({ name: 'New Email', type: 'n8n-nodes-base.gmailTrigger', typeVersion: 1.4,
      position: [0, 0], parameters: {
        pollTimes: { item: [{ mode: 'everyX', value: 15, unit: 'minutes' }] },

        // the full message is needed: the simple form has no body text and no X-Failed-Recipients header
        simple: false, filters: {}, options: {},
      } }), 'gmailOAuth2', GMAIL_CREDENTIAL),
    buildSheetNode('Read Sheet', [220, 0], { operation: 'read', options: {} }, { executeOnce: true }),
    buildCodeNode({ name: 'Classify Replies', files: ['product.js', 'config.js', 'classify_reply.js'],
      position: [440, 0], glue: [
      'const sheetRows = $input.all().map((item) => item.json);',
      "const results = $('New Email').all().map((item) => classifyReply(item.json, sheetRows)).filter(Boolean);",
      'return keepStrongestPerLead(results).map((json) => ({ json }));',
    ].join('\n') }),
    buildSheetNode('Mark Sheet Status', [660, 0], { operation: 'update', columns: sheetColumns({
      'Lead ID': '={{ $json.leadId }}',
      'Status': '={{ $json.status }}',
    }, ['Lead ID']), options: { cellFormat: 'RAW' } }),
    buildNode({ name: 'Mark Table Status', type: 'n8n-nodes-base.dataTable', position: [880, 0], parameters: {
      resource: 'row', operation: 'update', dataTableId: buildTableReference(LEADS_TABLE), matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'osm_key', condition: 'eq',
        keyValue: "={{ $('Classify Replies').item.json.leadId }}" }] },
      columns: { mappingMode: 'defineBelow', value: { status: "={{ $('Classify Replies').item.json.status }}" },
        matchingColumns: [], schema: [] },
    } }),
  ];
  const connections = connectNodes([
    ['New Email', 'Read Sheet'],
    ['Read Sheet', 'Classify Replies'],
    ['Classify Replies', 'Mark Sheet Status'],
    ['Mark Sheet Status', 'Mark Table Status'],
  ]);
  return { id: WORKFLOW_IDS.replyChecker, name: `${PRODUCT_NAME} Reply Checker`, nodes, connections, settings: SETTINGS,
    active: false };
}

module.exports = { buildSheetSyncWorkflow, buildSenderWorkflow, buildReplyCheckerWorkflow, buildSheetReference,
  withCredential, sheetColumns, buildSheetNode, SETTINGS };
