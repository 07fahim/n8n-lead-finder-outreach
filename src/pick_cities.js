const { CITIES_PER_RUN, CITIES_TABLE } = require('./config');

function compareCities(first, second) {

  // never-run cities go first in list order, so the first run takes the source document's first four cities
  if (!first.last_run && !second.last_run) return first.list_order - second.list_order;
  if (!first.last_run) return -1;
  if (!second.last_run) return 1;
  const difference = new Date(first.last_run) - new Date(second.last_run);
  return difference !== 0 ? difference : first.list_order - second.list_order;
}


function pickCities(cityRows) {

  const rows = cityRows.filter((row) => row.city);
  if (rows.length === 0) {
    throw new Error(`${CITIES_TABLE} is empty: load build/cities.json into it as described in README.md`);
  }
  return [...rows].sort(compareCities).slice(0, CITIES_PER_RUN);
}

module.exports = { pickCities };
