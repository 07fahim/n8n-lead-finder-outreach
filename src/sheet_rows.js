const { SHEET_HEADERS, LEAD_STATUS, SHEET_TAB_GID } = require('./config');

function toSheetRow(lead) {

  return {
    [SHEET_HEADERS.name]: lead.name,
    [SHEET_HEADERS.city]: lead.city,
    [SHEET_HEADERS.tier]: lead.tier,
    [SHEET_HEADERS.score]: lead.score,
    [SHEET_HEADERS.email]: lead.email || '',
    [SHEET_HEADERS.phone]: lead.phone || '',
    [SHEET_HEADERS.opener]: lead.opener || '',
    [SHEET_HEADERS.send]: false,
    [SHEET_HEADERS.sentDate]: '',
    [SHEET_HEADERS.status]: lead.status || LEAD_STATUS.new,
    [SHEET_HEADERS.leadId]: lead.osm_key,
  };
}


function findNewSheetRows(leads, sheetRows) {

  const inSheet = new Set(sheetRows.map((row) => row[SHEET_HEADERS.leadId]).filter(Boolean));
  return leads
    .filter((lead) => lead.osm_key && !inSheet.has(lead.osm_key))
    .sort((first, second) => second.score - first.score)
    .map(toSheetRow);
}


function buildCheckboxRequest(rowCount) {

  const column = Object.values(SHEET_HEADERS).indexOf(SHEET_HEADERS.send);
  return { requests: [{ setDataValidation: {
    range: { sheetId: SHEET_TAB_GID, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: column,
      endColumnIndex: column + 1 },
    rule: { condition: { type: 'BOOLEAN' }, strict: true },
  } }] };
}

module.exports = { toSheetRow, findNewSheetRows, buildCheckboxRequest };
