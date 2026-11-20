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

test('applies the trip rate threshold at one kilometer', () => {
  assert.equal(tarifaPorKilometro('viajes', 0.99), 0.38);
  assert.equal(tarifaPorKilometro('viajes', 1), 0.28);
});

test('applies the minimum fare and calculates longer trip fares', () => {
  assert.equal(calcularTarifa('viajes', 2), 1.5);
  assert.equal(calcularTarifa('viajes', 6), 1.68);
  assert.equal(calcularTarifa('envios', 6), 3);
});

test('applies saved tariff values while retaining the USD calculation basis', () => {
  const tarifas = {
    enviosPorKm: 0.75,
    viajesCortoPorKm: 0.5,
    viajesLargoPorKm: 0.3,
    tarifaMinima: 2,
    monedaVisualizacion: 'EUR'
  };
  assert.equal(tarifaPorKilometro('envios', 3, tarifas), 0.75);
  assert.equal(tarifaPorKilometro('viajes', 0.5, tarifas), 0.5);
  assert.equal(tarifaPorKilometro('viajes', 1, tarifas), 0.3);
  assert.equal(calcularTarifa('envios', 4, tarifas), 3);
  assert.equal(calcularTarifa('viajes', 2, tarifas), 2);
});

test('rejects invalid tariff settings and formats stable order codes', () => {
  assert.equal(esConfiguracionTarifasValida({
    enviosPorKm: 0.5,
    viajesCortoPorKm: 0.38,
    viajesLargoPorKm: 0.28,
    tarifaMinima: 1.5,
    monedaVisualizacion: 'VES'
  }), true);
  assert.equal(esConfiguracionTarifasValida({
    enviosPorKm: -1,
    viajesCortoPorKm: 0.38,
    viajesLargoPorKm: 0.28,
    tarifaMinima: 1.5,
    monedaVisualizacion: 'VES'
  }), false);
  assert.equal(esConfiguracionTarifasValida({
    enviosPorKm: 0.5,
    viajesCortoPorKm: 0.38,
    viajesLargoPorKm: 0.28,
    tarifaMinima: 1.5,
    monedaVisualizacion: 'USD'
  }), false);
  assert.equal(codigoPedido(39), 'LLV-000039');
  assert.equal(codigoPedido(1234567), 'LLV-1234567');
});
