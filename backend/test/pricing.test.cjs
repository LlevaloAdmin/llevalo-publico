const assert = require('node:assert/strict');
const test = require('node:test');
const { calcularTarifa, tarifaPorKilometro } = require('../dist/utils/pricing.js');

test('applies the trip rate threshold at one kilometer', () => {
  assert.equal(tarifaPorKilometro('viajes', 0.99), 0.38);
  assert.equal(tarifaPorKilometro('viajes', 1), 0.28);
});

test('applies the minimum fare and calculates longer trip fares', () => {
  assert.equal(calcularTarifa('viajes', 2), 1.5);
  assert.equal(calcularTarifa('viajes', 6), 1.68);
  assert.equal(calcularTarifa('envios', 6), 3);
});
