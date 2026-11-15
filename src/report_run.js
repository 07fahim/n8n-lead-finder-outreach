const { THIN_CITY_THRESHOLD } = require('./config');

function countWhere(leads, field, value) {

  return leads.filter((lead) => lead[field] === value).length;
}


function buildCityReports(cities, leads, nowIso) {

  return cities.map((city) => {
    const cityLeads = leads.filter((lead) => lead.city === city.city && lead.country === city.country);
    const failed = city.overpass_status !== 'ok';
    const thin = !failed && city.stats.reachable < THIN_CITY_THRESHOLD;
    let lastStatus = thin ? 'ok, thin city' : 'ok';
    if (failed) lastStatus = `failed: ${city.overpass_error}`.slice(0, 250);
    return {
      id: city.id,
      city: city.city,
      country: city.country,

      // a failed city keeps its old time, so the oldest-first pick retries it on the next run
      last_run: failed ? city.last_run : nowIso,
      last_status: lastStatus,
      last_leads: cityLeads.length,
      ...city.stats,
      competitor: countWhere(cityLeads, 'booking_status', 'competitor'),
      none_found: countWhere(cityLeads, 'booking_status', 'none_found'),
      no_website: countWhere(cityLeads, 'booking_status', 'no_website'),
      site_down: countWhere(cityLeads, 'booking_status', 'site_down'),
      site_blocked: countWhere(cityLeads, 'booking_status', 'site_blocked'),
      hot: countWhere(cityLeads, 'tier', 'Hot'),
      warm: countWhere(cityLeads, 'tier', 'Warm'),
      cold: countWhere(cityLeads, 'tier', 'Cold'),
    };
  });
}


function summarizeRun(reports) {

  const failedReports = reports.filter((report) => report.last_status.startsWith('failed'));
  if (reports.length > 0 && failedReports.length === reports.length) {
    const details = failedReports.map((report) => `${report.city}: ${report.last_status}`).join(' | ');
    throw new Error(`every city failed Overpass: ${details}`);
  }
  const total = (field) => reports.reduce((sum, report) => sum + report[field], 0);
  return { cities: reports.length, failed: failedReports.length, saved: total('last_leads'), hot: total('hot'),
    warm: total('warm'), cold: total('cold') };
}

module.exports = { buildCityReports, summarizeRun };
