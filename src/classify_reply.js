const { SHEET_HEADERS, LEAD_STATUS, STOP_WORDS, BOUNCE_SENDER, REPLY_QUOTE_START } = require('./config');

function readNewText(text) {

  // ponytail: cuts at the usual quote-start lines and drops '>' lines; a mail app with another quote style leaks the
  // quoted text into the check, and our footer's "Not interested?" line then marks the lead Stopped
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
  const addresses = new Set(bounceText.match(/[\w.+-]+@[\w.-]+/g));
  return sheetRows.find((row) => row[SHEET_HEADERS.sentDate] && addresses.has(readRowEmail(row)));
}


function findReplyRow(sender, sheetRows) {

  // the same address can sit on an unsent row too; the reply answers the email we sent
  const matches = sheetRows.filter((row) => readRowEmail(row) === sender);
  return matches.find((row) => row[SHEET_HEADERS.sentDate]) || matches[0];
}


function isAutoReply(message) {

  // mailparser gives the whole header line, e.g. 'Auto-Submitted: auto-replied'; only 'no' means a person wrote it
  const header = message.headers?.['auto-submitted'];
  return Boolean(header) && !/:\s*no\s*$/i.test(String(header));
}


function classifyReply(message, sheetRows) {

  const sender = String(message.from?.value?.[0]?.address || '').toLowerCase();
  if (!sender) return null;
  const rows = sheetRows.filter((row) => readRowEmail(row) && row[SHEET_HEADERS.leadId]);
  const isBounce = BOUNCE_SENDER.test(sender);
  // bounces carry Auto-Submitted too, so only a non-bounce out-of-office is skipped
  if (!isBounce && isAutoReply(message)) return null;
  const row = isBounce ? findBouncedRow(message, rows) : findReplyRow(sender, rows);
  if (!row || [LEAD_STATUS.stopped, LEAD_STATUS.bounced].includes(row[SHEET_HEADERS.status])) return null;
  let status = LEAD_STATUS.replied;
  if (isBounce) status = LEAD_STATUS.bounced;
  else if (STOP_WORDS.test(readNewText(message.text))) status = LEAD_STATUS.stopped;
  return { leadId: row[SHEET_HEADERS.leadId], status };
}

module.exports = { classifyReply };
