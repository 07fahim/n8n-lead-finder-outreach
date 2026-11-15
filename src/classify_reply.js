const { SHEET_HEADERS, LEAD_STATUS, STOP_WORDS, BOUNCE_SENDER, REPLY_QUOTE_START } = require('./config');

function readNewText(text) {

  // ponytail: cuts at the usual quote-start lines and drops '>' lines; a mail app with another quote style leaks the
  // quoted footer's "stop" into the check, which only marks a lead Stopped (the safe side)
  const body = String(text || '');
  const quoteStart = body.search(REPLY_QUOTE_START);
  return (quoteStart === -1 ? body : body.slice(0, quoteStart))
    .split('\n').filter((line) => !line.trimStart().startsWith('>')).join('\n');
}


function readRowEmail(row) {

  return String(row[SHEET_HEADERS.email] || '').trim().toLowerCase();
}


function findBouncedRow(message, sheetRows) {

  const bounceText = `${message.headers?.['x-failed-recipients'] || ''}\n${message.text || ''}`.toLowerCase();
  return sheetRows.find((row) => row[SHEET_HEADERS.sentDate] && bounceText.includes(readRowEmail(row)));
}


function classifyReply(message, sheetRows) {

  const sender = String(message.from?.value?.[0]?.address || '').toLowerCase();
  if (!sender) return null;
  const rows = sheetRows.filter((row) => readRowEmail(row) && row[SHEET_HEADERS.leadId]);
  const isBounce = BOUNCE_SENDER.test(sender);
  const row = isBounce ? findBouncedRow(message, rows) : rows.find((candidate) => readRowEmail(candidate) === sender);
  if (!row || [LEAD_STATUS.stopped, LEAD_STATUS.bounced].includes(row[SHEET_HEADERS.status])) return null;
  let status = LEAD_STATUS.replied;
  if (isBounce) status = LEAD_STATUS.bounced;
  else if (STOP_WORDS.test(readNewText(message.text))) status = LEAD_STATUS.stopped;
  return { leadId: row[SHEET_HEADERS.leadId], status };
}

module.exports = { classifyReply };
