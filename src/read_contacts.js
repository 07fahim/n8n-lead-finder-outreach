const { JUNK_EMAIL_PARTS, JUNK_EMAIL_LOCAL_PARTS, INSTAGRAM_NON_HANDLES } = require('./config');

function readInstagramHandle(value) {

  if (!value) return '';
  const fromUrl = String(value).match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  const handle = (fromUrl ? fromUrl[1] : String(value)).replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return '';
  return INSTAGRAM_NON_HANDLES.includes(handle.toLowerCase()) ? '' : handle;
}


function findEmails(html) {

  // site builders escape '>' as \u003e inside JSON, which would glue "u003e" to the address
  const text = html.replace(/\\u003[ce]/gi, ' ');
  const emails = new Set();
  for (const match of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const email = match[0].toLowerCase();
    if (/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(email)) continue;
    if (JUNK_EMAIL_PARTS.some((part) => email.includes(part))) continue;
    if (JUNK_EMAIL_LOCAL_PARTS.includes(email.split('@')[0])) continue;
    emails.add(email);
  }
  return [...emails];
}


function findWhatsapp(html) {

  const match = html.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=)\+?(\d{7,15})/i);
  return match ? `https://wa.me/${match[1]}` : '';
}


function findInstagram(html) {

  for (const match of html.matchAll(/instagram\.com\/([A-Za-z0-9._]+)/gi)) {
    const handle = readInstagramHandle(match[1]);
    if (handle) return handle;
  }
  return '';
}

module.exports = { readInstagramHandle, findEmails, findWhatsapp, findInstagram };
