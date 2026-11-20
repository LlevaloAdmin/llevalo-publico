const assert = require('node:assert/strict');
const test = require('node:test');
const {
  desfaseHorarioValido,
  fechaIsoValida,
  horaPedidoValida
} = require('../dist/utils/orderSearch.js');

test('validates calendar dates for order searches', () => {
  assert.equal(fechaIsoValida('2024-02-29'), true);
  assert.equal(fechaIsoValida('2026-02-29'), false);
  assert.equal(fechaIsoValida('2026-13-01'), false);
  assert.equal(fechaIsoValida('20/11/2026'), false);
});

test('validates exact hour and minute filters', () => {
  assert.equal(horaPedidoValida('00:00'), true);
  assert.equal(horaPedidoValida('23:59'), true);
  assert.equal(horaPedidoValida('24:00'), false);
  assert.equal(horaPedidoValida('12:60'), false);
});

test('limits time-zone offsets to valid civil time ranges', () => {
  assert.equal(desfaseHorarioValido(240), true);
  assert.equal(desfaseHorarioValido(-840), true);
  assert.equal(desfaseHorarioValido(841), false);
  assert.equal(desfaseHorarioValido(1.5), false);
});
