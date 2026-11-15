const { SHEET_HEADERS, LEAD_STATUS, SINGLE_ADDRESS } = require('./config');

function isTicked(value) {

  // the Sheets node reads a ticked checkbox as true, or as 'TRUE' when values come back formatted
  return value === true || String(value).toUpperCase() === 'TRUE';
}


function readEmail(row) {

  return String(row[SHEET_HEADERS.email] || '').trim().toLowerCase();
}


function isReadyToSend(row) {

  return isTicked(row[SHEET_HEADERS.send]) && !row[SHEET_HEADERS.sentDate] && SINGLE_ADDRESS.test(readEmail(row)) &&
    Boolean(row[SHEET_HEADERS.opener]) && row[SHEET_HEADERS.status] === LEAD_STATUS.new &&
    Boolean(row[SHEET_HEADERS.leadId]);
}


function pickRowsToSend(sheetRows, today, limit) {

  const sentToday = sheetRows.filter((row) => row[SHEET_HEADERS.sentDate] === today).length;
  const emailed = new Set(sheetRows.filter((row) => row[SHEET_HEADERS.sentDate]).map(readEmail));
  const picked = [];
  for (const row of sheetRows) {
    if (picked.length >= limit - sentToday) break;
    if (!isReadyToSend(row) || emailed.has(readEmail(row))) continue;
    emailed.add(readEmail(row));
    picked.push(row);
  }
  return picked;
}

module.exports = { pickRowsToSend };
