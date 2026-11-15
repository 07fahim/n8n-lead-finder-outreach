const test = require('node:test');
const assert = require('node:assert/strict');
const { pickCities } = require('../src/pick_cities');

function makeRow(listOrder, lastRun) {
  return { id: listOrder, city: `City ${listOrder}`, country: 'UK', list_order: listOrder, last_run: lastRun };
}

test('never-run cities come first in list order, four at most', () => {
  const rows = [makeRow(3, null), makeRow(1, null), makeRow(2, '2026-11-01T00:00:00.000Z'), makeRow(4, null),
    makeRow(5, null), makeRow(6, null)];
  assert.deepEqual(pickCities(rows).map((row) => row.list_order), [1, 3, 4, 5]);
});

test('then the oldest last run, ties by list order', () => {
  const rows = [makeRow(1, '2026-11-10T00:00:00.000Z'), makeRow(2, '2026-11-01T00:00:00.000Z'),
    makeRow(3, '2026-11-01T00:00:00.000Z')];
  assert.deepEqual(pickCities(rows).map((row) => row.list_order), [2, 3, 1]);
});

test('an empty table (the single {} item from Read Seen style output) is refused', () => {
  assert.throws(() => pickCities([{}]), /acmebook_cities is empty/);
});
