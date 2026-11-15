const { POINTS, REASON_TEXTS, HOT_MIN_SCORE, WARM_MIN_SCORE, OPENERS } = require('./product');

function findTier(score) {

  if (score >= HOT_MIN_SCORE) return 'Hot';
  return score >= WARM_MIN_SCORE ? 'Warm' : 'Cold';
}


function writeOpener(toolStatus, name, tool) {

  // a function replacement keeps a '$' in a business name literal instead of reading it as a pattern
  const opener = toolStatus === 'competitor' && !tool ? OPENERS.competitor_unnamed : OPENERS[toolStatus];
  return (opener || '').replaceAll('{name}', () => name).replaceAll('{tool}', () => tool);
}


function buildLead(business, check, today) {

  if (check.tool_status === 'already_customer') return null;
  const email = business.email || check.emails[0] || '';
  const instagram = business.instagram || check.instagram || '';
  const reasons = [];
  let score = 0;
  const addSignal = (points, reason) => {
    score += points;
    reasons.push(`${reason} (+${points})`);
  };
  if (check.tool_status === 'competitor') reasons.push(`uses ${check.tool_name || REASON_TEXTS.unnamedTool}`);
  if (['none_found', 'no_website'].includes(check.tool_status)) {
    addSignal(POINTS.noTool, REASON_TEXTS.noTool);
  }
  if (check.tool_status === 'no_website') addSignal(POINTS.noWebsite, 'no website');
  if (email) addSignal(POINTS.email, 'has email');
  if (check.whatsapp) addSignal(POINTS.whatsapp, 'has WhatsApp');
  if (business.phone) addSignal(POINTS.phone, 'has phone');
  if (instagram) addSignal(POINTS.instagram, 'has Instagram');
  if (check.tool_status === 'site_down') reasons.push('website down, check the business is still open');
  if (check.tool_status === 'site_blocked') reasons.push('site blocked our check, look by hand');
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
    tool_status: check.tool_status,
    tool_name: check.tool_name,
    address: business.address,
    maps_link: business.maps_link,
    opener: writeOpener(check.tool_status, business.name, check.tool_name),
    status: 'New',
    date_found: today,
  };
}

module.exports = { findTier, buildLead };
