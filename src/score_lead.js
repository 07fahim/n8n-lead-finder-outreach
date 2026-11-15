const { POINTS, HOT_MIN_SCORE, WARM_MIN_SCORE, OPENERS } = require('./product');

function findTier(score) {

  if (score >= HOT_MIN_SCORE) return 'Hot';
  return score >= WARM_MIN_SCORE ? 'Warm' : 'Cold';
}


function writeOpener(bookingStatus, name, tool) {

  // a function replacement keeps a '$' in a business name literal instead of reading it as a pattern
  const opener = bookingStatus === 'competitor' && !tool ? OPENERS.competitor_unnamed : OPENERS[bookingStatus];
  return (opener || '').replaceAll('{name}', () => name).replaceAll('{tool}', () => tool);
}


function buildLead(business, check, today) {

  if (check.booking_status === 'acmebook') return null;
  const email = business.email || check.emails[0] || '';
  const instagram = business.instagram || check.instagram || '';
  const reasons = [];
  let score = 0;
  const addSignal = (points, reason) => {
    score += points;
    reasons.push(`${reason} (+${points})`);
  };
  if (check.booking_status === 'competitor') reasons.push(`uses ${check.booking_tool || 'an online booking tool'}`);
  if (['none_found', 'no_website'].includes(check.booking_status)) {
    addSignal(POINTS.noOnlineBooking, 'no online booking found');
  }
  if (check.booking_status === 'no_website') addSignal(POINTS.noWebsite, 'no website');
  if (email) addSignal(POINTS.email, 'has email');
  if (check.whatsapp) addSignal(POINTS.whatsapp, 'has WhatsApp');
  if (business.phone) addSignal(POINTS.phone, 'has phone');
  if (instagram) addSignal(POINTS.instagram, 'has Instagram');
  if (check.booking_status === 'site_down') reasons.push('website down, check the business is still open');
  if (check.booking_status === 'site_blocked') reasons.push('site blocked our check, look by hand');
  return {
    osm_key: business.osm_key,
    name: business.name,
    category: business.category,
    country: business.country,
    city: business.city,
    tier: findTier(score),
    score,
    reasons: reasons.join('; '),
    phone: business.phone,
    email,
    whatsapp: check.whatsapp,
    instagram,
    website: business.website,
    booking_status: check.booking_status,
    booking_tool: check.booking_tool,
    address: business.address,
    maps_link: business.maps_link,
    opener: writeOpener(check.booking_status, business.name, check.booking_tool),
    status: 'New',
    date_found: today,
  };
}

module.exports = { findTier, buildLead };
