const assert = require('node:assert/strict');
const test = require('node:test');
const { rankForRating } = require('../dist/utils/reputation.js');

test('assigns reputation levels from the average and keeps unrated users new', () => {
  assert.equal(rankForRating(5, 0), 'Nuevo');
  assert.equal(rankForRating(2.9, 1), 'Bronce');
  assert.equal(rankForRating(3, 5), 'Plata');
  assert.equal(rankForRating(4, 3), 'Oro');
  assert.equal(rankForRating(4.5, 2), 'Platino');
  assert.equal(rankForRating(4.8, 10), 'Diamante');
});
