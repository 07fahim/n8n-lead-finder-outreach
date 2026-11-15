const { CATEGORY_RULES, BARBERSHOP_CATEGORY } = require('./config');
const { readInstagramHandle } = require('./read_contacts');

function readTag(tags, keys) {

  for (const key of keys) {
    if (tags[key]) return String(tags[key]).trim();
  }
  return '';
}


function findCategory(tags) {

  const rule = CATEGORY_RULES.find((candidate) => tags[candidate.tagKey] === candidate.tagValue);
  if (!rule) return '';
  const mentionsBarber = Object.values(tags).some((value) => /barber/i.test(String(value)));
  return rule.tagValue === 'hairdresser' && mentionsBarber ? BARBERSHOP_CATEGORY : rule.category;
}


function addScheme(website) {

  if (!website) return '';
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}


function buildAddress(tags, cityName) {

  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  return [street, tags['addr:city'] || cityName, tags['addr:postcode']].filter(Boolean).join(', ');
}


function buildMapsLink(name, address) {

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}`)}`;
}


function normalizeCities(cityResults, seenKeys) {

  const seen = new Set(seenKeys);
  const keysThisRun = new Set();
  const namePhonesThisRun = new Set();
  return cityResults.map((cityResult) => {
    const stats = { found: cityResult.elements.length, chains: 0, no_contact: 0, reachable: 0, duplicates: 0,
      already_seen: 0 };
    const businesses = [];
    for (const element of cityResult.elements) {
      const tags = element.tags || {};
      if (tags.brand || tags['brand:wikidata']) {
        stats.chains++;
        continue;
      }
      const website = addScheme(readTag(tags, ['website', 'contact:website', 'url']));
      const phone = readTag(tags, ['phone', 'contact:phone']);
      const email = readTag(tags, ['email', 'contact:email']);
      if (!website && !phone && !email) {
        stats.no_contact++;
        continue;
      }
      stats.reachable++;
      const osmKey = `${element.type}/${element.id}`;

      // one business is often mapped twice, as a point and as its building
      const phoneDigits = phone.replace(/\D/g, '');
      const namePhone = phoneDigits ? `${tags.name.toLowerCase()}|${phoneDigits}` : '';
      if (keysThisRun.has(osmKey) || (namePhone && namePhonesThisRun.has(namePhone))) {
        stats.duplicates++;
        continue;
      }
      keysThisRun.add(osmKey);
      if (namePhone) namePhonesThisRun.add(namePhone);
      if (seen.has(osmKey)) {
        stats.already_seen++;
        continue;
      }
      const address = buildAddress(tags, cityResult.city);
      businesses.push({
        osm_key: osmKey,
        name: tags.name,
        category: findCategory(tags),
        country: cityResult.country,
        city: cityResult.city,
        phone,
        email,
        website,
        instagram: readInstagramHandle(readTag(tags, ['contact:instagram', 'instagram'])),
        address,
        maps_link: buildMapsLink(tags.name, address),
      });
    }
    return {
      id: cityResult.id,
      city: cityResult.city,
      country: cityResult.country,
      last_run: cityResult.last_run ?? null,
      overpass_status: cityResult.overpass_status,
      overpass_error: cityResult.overpass_error,
      stats,
      businesses,
    };
  });
}

module.exports = { normalizeCities };
