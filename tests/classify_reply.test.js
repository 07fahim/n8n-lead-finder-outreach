const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyReply } = require('../src/classify_reply');

const ROWS = [
  { 'Lead email': 'Owner@Salon.com', 'Lead ID': 'node/1', 'Status': 'Sent', 'Sent date': '2026-11-16' },
  { 'Lead email': 'done@spa.com', 'Lead ID': 'node/2', 'Status': 'Stopped', 'Sent date': '2026-11-15' },
  { 'Lead email': 'never@sent.com', 'Lead ID': 'node/3', 'Status': 'New', 'Sent date': '' },
];

function makeMessage(address, text, headers = {}) {
  return { from: { value: [{ address }] }, text, headers };
}

test('a reply from a lead is Replied', () => {
  assert.deepEqual(classifyReply(makeMessage('owner@salon.com', 'Sounds good, how much is it?'), ROWS),
    { leadId: 'node/1', status: 'Replied' });
});

test('stop, unsubscribe or remove me in the new text is Stopped', () => {
  for (const text of ['STOP', 'please unsubscribe me', 'Remove me from your list']) {
    assert.deepEqual(classifyReply(makeMessage('owner@salon.com', text), ROWS),
      { leadId: 'node/1', status: 'Stopped' }, text);
  }
});

test('the stop line of our own footer, quoted below the reply, is not an opt-out', () => {
  const text = 'Yes, call me tomorrow.\n\nOn Mon, 16 Nov 2026 at 10:00, Alex <x@gmail.com> wrote:\n' +
    '> Not interested? Reply "stop" and I won\'t email again.';
  assert.equal(classifyReply(makeMessage('owner@salon.com', text), ROWS).status, 'Replied');
});

test('a bounce names the sent lead in X-Failed-Recipients or the text', () => {
  const header = makeMessage('mailer-daemon@googlemail.com', 'Address not found',
    { 'x-failed-recipients': 'X-Failed-Recipients: owner@salon.com' });
  assert.deepEqual(classifyReply(header, ROWS), { leadId: 'node/1', status: 'Bounced' });
  const body = makeMessage('postmaster@mail.example', 'Delivery to owner@salon.com failed');
  assert.deepEqual(classifyReply(body, ROWS), { leadId: 'node/1', status: 'Bounced' });
});

test('unknown senders, unsent leads in bounces and Stopped or Bounced leads give null', () => {
  assert.equal(classifyReply(makeMessage('someone@else.com', 'hello'), ROWS), null);
  assert.equal(classifyReply(makeMessage('mailer-daemon@googlemail.com', 'never@sent.com failed'), ROWS), null);
  assert.equal(classifyReply(makeMessage('done@spa.com', 'actually, tell me more'), ROWS), null);
  assert.equal(classifyReply({ text: 'no from' }, ROWS), null);
});

test('stop inside a normal sentence is a reply, a clear phrase is an opt-out', () => {
  assert.equal(classifyReply(makeMessage('owner@salon.com', "I'll stop by Tuesday, how much is it?"), ROWS).status,
    'Replied');
  assert.equal(classifyReply(makeMessage('owner@salon.com', 'Hi, please stop emailing me.'), ROWS).status, 'Stopped');
});

test('a signature line starting with From: does not hide an opt-out below it', () => {
  assert.equal(classifyReply(makeMessage('owner@salon.com', 'Thanks\nFrom: the team\nunsubscribe'), ROWS).status,
    'Stopped');
});

test('natural opt-outs in the new text are Stopped', () => {
  const texts = ['Please stop.', 'Hi,\nstop', 'Hi Alex,\n\nStop\n\nThanks', 'Please don’t email me again',
    'Not interested, please do not contact me', 'No thanks, take us off your list'];
  for (const text of texts) {
    assert.equal(classifyReply(makeMessage('owner@salon.com', text), ROWS).status, 'Stopped', text);
  }
});

test('a bounce marks only the row whose email it names exactly', () => {
  const rows = [
    { 'Lead email': 'spa@x.com', 'Lead ID': 'node/a', 'Status': 'Sent', 'Sent date': '2026-11-16' },
    { 'Lead email': 'dayspa@x.com', 'Lead ID': 'node/b', 'Status': 'Sent', 'Sent date': '2026-11-16' },
  ];
  assert.deepEqual(classifyReply(makeMessage('mailer-daemon@googlemail.com', 'Delivery to dayspa@x.com failed'), rows),
    { leadId: 'node/b', status: 'Bounced' });
});

test('a reply from an address on two rows marks the sent row', () => {
  const rows = [
    { 'Lead email': 'twice@x.com', 'Lead ID': 'node/unsent', 'Status': 'New', 'Sent date': '' },
    { 'Lead email': 'twice@x.com', 'Lead ID': 'node/sent', 'Status': 'Sent', 'Sent date': '2026-11-16' },
  ];
  assert.equal(classifyReply(makeMessage('twice@x.com', 'Tell me more'), rows).leadId, 'node/sent');
});

test('auto-replies are skipped, but not bounces or Auto-Submitted: no', () => {
  const auto = { 'auto-submitted': 'Auto-Submitted: auto-replied' };
  assert.equal(classifyReply(makeMessage('owner@salon.com', 'I am out of the office', auto), ROWS), null);
  assert.equal(classifyReply(makeMessage('owner@salon.com', 'Sounds good',
    { 'auto-submitted': 'Auto-Submitted: no' }), ROWS).status, 'Replied');
  assert.deepEqual(classifyReply(makeMessage('mailer-daemon@googlemail.com', 'owner@salon.com failed', auto), ROWS),
    { leadId: 'node/1', status: 'Bounced' });
});
