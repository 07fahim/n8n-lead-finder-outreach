const test = require('node:test');
const assert = require('node:assert/strict');
const { readInstagramHandle, findEmails, findWhatsapp, findInstagram } = require('../src/read_contacts');

test('emails: junk, image names and escaped JSON prefixes are dropped', () => {
  const html = 'mail <a href="mailto:Hello@Salon.co.uk">x</a> logo@2x.png john@example.com ' +
    '"\\u003einfo@salon.co.uk" hello@salon.co.uk test@salon.co.uk salonname@salon.co.uk';
  assert.deepEqual(findEmails(html), ['hello@salon.co.uk', 'info@salon.co.uk', 'salonname@salon.co.uk']);
});

test('whatsapp links from wa.me and api.whatsapp.com', () => {
  assert.equal(findWhatsapp('<a href="https://wa.me/447700900123">'), 'https://wa.me/447700900123');
  assert.equal(findWhatsapp('https://api.whatsapp.com/send?phone=+15551234567'), 'https://wa.me/15551234567');
  assert.equal(findWhatsapp('https://api.whatsapp.com/send/?phone=%2B447700900123'), 'https://wa.me/447700900123');
  assert.equal(findWhatsapp('no chat here'), '');
});

test('instagram: posts are skipped, the profile handle is kept', () => {
  assert.equal(findInstagram('https://www.instagram.com/p/abc https://instagram.com/salon.mcr/'), 'salon.mcr');
  assert.equal(readInstagramHandle('@salon'), 'salon');
  assert.equal(readInstagramHandle('https://www.instagram.com/salon_x'), 'salon_x');
  assert.equal(readInstagramHandle('not a handle!'), '');
});
