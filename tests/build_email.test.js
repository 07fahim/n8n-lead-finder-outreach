const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEmail } = require('../src/build_email');

const ROW = { 'Name': 'Hue Hair', 'Lead email': ' info@salon-one.test ', 'Lead ID': 'node/7',
  'Opener': 'Hi Hue Hair, noticed your website does not have a way to book online...' };

test('the email is the opener, the free plan line, the signature and the footer', () => {
  assert.deepEqual(buildEmail(ROW, '1 Example Street, Springfield, IL 62701, USA'), {
    leadId: 'node/7',
    to: 'info@salon-one.test',
    subject: 'Quick question, Hue Hair',
    text: [
      'Hi Hue Hair, noticed your website does not have a way to book online...',
      '',
      "There's a free plan to try it: https://acmebook.example",
      '',
      'Thanks,',
      'Alex',
      'AcmeBook',
      '',
      '--',
      '1 Example Street, Springfield, IL 62701, USA',
      'Not interested? Reply "stop" and I won\'t email again.',
    ].join('\n'),
  });
});

test('a $ in a name stays literal', () => {
  assert.equal(buildEmail({ ...ROW, 'Name': 'Cuts $& Co' }, 'Main Street 1').subject, 'Quick question, Cuts $& Co');
});

test('an empty postal address stops the send', () => {
  assert.throws(() => buildEmail(ROW, '  '), /POSTAL_ADDRESS in src\/product\.js/);
});
