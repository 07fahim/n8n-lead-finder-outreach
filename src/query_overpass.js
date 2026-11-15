const {
  CATEGORY_RULES, SEARCH_RADIUS_METRES, OVERPASS_SERVER_TIMEOUT_SECONDS, OVERPASS_RESULT_LIMIT, OVERPASS_SERVERS,
  OVERPASS_WAITS_SECONDS, OVERPASS_REQUEST_TIMEOUT_SECONDS, OVERPASS_CITY_BUDGET_SECONDS, OVERPASS_USER_AGENT,
} = require('./config');

function buildOverpassQuery(lat, lon) {

  const valuesByKey = new Map();
  for (const rule of CATEGORY_RULES) {
    if (!valuesByKey.has(rule.tagKey)) valuesByKey.set(rule.tagKey, []);
    valuesByKey.get(rule.tagKey).push(rule.tagValue);
  }
  const around = `around:${SEARCH_RADIUS_METRES},${lat},${lon}`;
  const statements = [...valuesByKey].map(
    ([tagKey, values]) => `  nwr(${around})["${tagKey}"~"^(${values.join('|')})$"]["name"];`,
  );
  return `[out:json][timeout:${OVERPASS_SERVER_TIMEOUT_SECONDS}];\n(\n${statements.join('\n')}\n);\n` +
    `out center tags ${OVERPASS_RESULT_LIMIT};`;
}


function readOverpassElements(response) {

  if (response.statusCode !== 200) throw new Error(`HTTP ${response.statusCode}`);
  let parsed;
  try {
    parsed = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
  } catch {
    throw new Error('response is not JSON (server error page)');
  }
  if (!parsed || !Array.isArray(parsed.elements)) throw new Error('response has no elements');

  // overpass reports a query timeout as status 200 with a remark and partial results
  if (parsed.remark && /error|timed out/i.test(parsed.remark)) {
    throw new Error(`overpass remark: ${parsed.remark.slice(0, 120)}`);
  }
  return parsed.elements;
}


function waitSeconds(seconds) {

  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}


async function queryCity(city, httpRequest, sleep, now) {

  const query = buildOverpassQuery(city.lat, city.lon);
  const startedAt = now();
  const errors = [];
  for (let attempt = 0; attempt <= OVERPASS_WAITS_SECONDS.length; attempt++) {
    if (attempt > 0) {
      const waitBefore = OVERPASS_WAITS_SECONDS[attempt - 1];
      const elapsedSeconds = (now() - startedAt) / 1000;
      if (elapsedSeconds + waitBefore + OVERPASS_REQUEST_TIMEOUT_SECONDS > OVERPASS_CITY_BUDGET_SECONDS) break;
      await sleep(waitBefore);
    }
    const server = OVERPASS_SERVERS[attempt % OVERPASS_SERVERS.length];
    try {
      const response = await httpRequest({
        method: 'POST',
        url: server,
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': OVERPASS_USER_AGENT },
        returnFullResponse: true,
        ignoreHttpStatusErrors: true,
        timeout: OVERPASS_REQUEST_TIMEOUT_SECONDS * 1000,
        encoding: 'text',
        json: false,
      });
      return { ...city, overpass_status: 'ok', overpass_error: '', elements: readOverpassElements(response) };
    } catch (error) {
      errors.push(`${new URL(server).hostname}: ${error.message}`);
    }
  }
  return { ...city, overpass_status: 'failed', overpass_error: errors.join('; ').slice(0, 300), elements: [] };
}

module.exports = { buildOverpassQuery, queryCity, waitSeconds };
