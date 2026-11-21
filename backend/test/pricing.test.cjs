const assert = require('node:assert/strict');
const test = require('node:test');
const {
  calcularTarifa,
  codigoPedido,
  esConfiguracionTarifasValida,
  tarifaPorKilometro
} = {
  ...require('../dist/utils/pricing.js'),
  ...require('../dist/utils/orderCode.js')
};

test('selects standard and long-trip rates around the 25 km threshold', () => {
  assert.equal(tarifaPorKilometro('viajes', 0.99), 0.28);
  assert.equal(tarifaPorKilometro('viajes', 1), 0.28);
  assert.equal(tarifaPorKilometro('viajes', 24.99), 0.28);
  assert.equal(tarifaPorKilometro('viajes', 25), 0.38);
});

test('charges the minimum for sub-kilometer trips and keeps the minimum floor', () => {
  assert.equal(calcularTarifa('viajes', 0.5), 1.5);
  assert.equal(calcularTarifa('viajes', 2), 1.5);
  assert.equal(calcularTarifa('viajes', 6), 1.68);
  assert.equal(calcularTarifa('viajes', 25), 9.5);
  assert.equal(calcularTarifa('envios', 6), 3);
});

test('applies saved trip and delivery tariff values', () => {
  const tarifas = {
    enviosPorKm: 0.75,
    viajesDesde1KmPorKm: 0.3,
    viajesLargosPorKm: 0.5,
    viajesLargosDesdeKm: 25,
    tarifaMinima: 2
  };
  assert.equal(tarifaPorKilometro('envios', 3, tarifas), 0.75);
  assert.equal(tarifaPorKilometro('viajes', 0.5, tarifas), 0.3);
  assert.equal(tarifaPorKilometro('viajes', 1, tarifas), 0.3);
  assert.equal(tarifaPorKilometro('viajes', 25, tarifas), 0.5);
  assert.equal(calcularTarifa('envios', 4, tarifas), 3);
  assert.equal(calcularTarifa('viajes', 2, tarifas), 2);
  assert.equal(calcularTarifa('viajes', 10, tarifas), 3);
  assert.equal(calcularTarifa('viajes', 25, tarifas), 12.5);
  assert.equal(calcularTarifa('viajes', 0.5, { ...tarifas, viajesDesde1KmPorKm: 5 }), 2);
});

test('validates tariff values and formats stable order codes', () => {
  assert.equal(esConfiguracionTarifasValida({
    enviosPorKm: 0.5,
    viajesDesde1KmPorKm: 0.28,
    viajesLargosPorKm: 0.38,
    tarifaMinima: 1.5
  }), true);
  assert.equal(esConfiguracionTarifasValida({
    enviosPorKm: -1,
    viajesDesde1KmPorKm: 0.28,
    viajesLargosPorKm: 0.38,
    tarifaMinima: 1.5
  }), false);
  assert.equal(esConfiguracionTarifasValida({
    enviosPorKm: 0.5,
    viajesDesde1KmPorKm: 0.28,
    tarifaMinima: 1.5
  }), false);
  assert.equal(codigoPedido(39), 'LLV-000039');
  assert.equal(codigoPedido(1234567), 'LLV-1234567');
});
