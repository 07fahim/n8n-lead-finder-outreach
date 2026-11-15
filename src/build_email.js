const { EMAIL_SUBJECT, EMAIL_BODY, SENDER_NAME, POSTAL_ADDRESS, SHEET_HEADERS } = require('./config');

function fillTemplate(template, values) {

  // a function replacement keeps a '$' in a business name literal instead of reading it as a pattern
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, () => value), template);
}


function buildEmail(row, postalAddress = POSTAL_ADDRESS) {

  if (!postalAddress.trim()) {
    throw new Error('POSTAL_ADDRESS in src/config.js is empty: a sales email must carry a postal address');
  }
  return {
    leadId: row[SHEET_HEADERS.leadId],
    to: String(row[SHEET_HEADERS.email]).trim(),
    subject: fillTemplate(EMAIL_SUBJECT, { name: row[SHEET_HEADERS.name] }),
    text: fillTemplate(EMAIL_BODY, { opener: row[SHEET_HEADERS.opener], sender: SENDER_NAME, address: postalAddress }),
  };
}

module.exports = { buildEmail };
