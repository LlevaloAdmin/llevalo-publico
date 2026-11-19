const assert = require('node:assert/strict');
const test = require('node:test');
const { estadoPagoAlCancelar } = require('../dist/utils/payments.js');

test('automatically refunds a canceled trip paid with corporate balance', () => {
  assert.equal(estadoPagoAlCancelar('saldo_corporativo', 'pagado'), 'reembolsado');
});

test('queues mobile-payment refunds for canceled paid or pending trips', () => {
  assert.equal(estadoPagoAlCancelar('pago_movil', 'pagado'), 'reembolso_pendiente');
  assert.equal(estadoPagoAlCancelar('pago_movil', 'pendiente'), 'reembolso_pendiente');
});

test('does not create refunds for unpaid cash trips or rejected payments', () => {
  assert.equal(estadoPagoAlCancelar('efectivo', 'pendiente'), 'pendiente');
  assert.equal(estadoPagoAlCancelar('pago_movil', 'rechazado'), 'rechazado');
});
