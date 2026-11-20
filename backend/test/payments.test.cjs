const assert = require('node:assert/strict');
const test = require('node:test');
const { estadoPagoAlCancelar, referenciaPagoValida, solicitudExpirada } = require('../dist/utils/payments.js');

test('automatically refunds a canceled order paid with corporate balance', () => {
  assert.equal(estadoPagoAlCancelar('saldo_corporativo', 'pagado'), 'reembolsado');
});

test('queues mobile-payment refunds for canceled paid or pending orders', () => {
  assert.equal(estadoPagoAlCancelar('pago_movil', 'pagado'), 'reembolso_pendiente');
  assert.equal(estadoPagoAlCancelar('pago_movil', 'pendiente'), 'reembolso_pendiente');
});

test('does not create refunds for unpaid cash orders or rejected payments', () => {
  assert.equal(estadoPagoAlCancelar('efectivo', 'pendiente'), 'pendiente');
  assert.equal(estadoPagoAlCancelar('pago_movil', 'rechazado'), 'rechazado');
});

test('accepts only numeric payment references up to 100 digits', () => {
  assert.equal(referenciaPagoValida('0'), true);
  assert.equal(referenciaPagoValida('1234567890'.repeat(10)), true);
  assert.equal(referenciaPagoValida(''), false);
  assert.equal(referenciaPagoValida('123abc'), false);
  assert.equal(referenciaPagoValida('1'.repeat(101)), false);
});

test('expires a published request at 60 seconds, not before', () => {
  const publicadoEn = new Date('2026-03-01T12:00:00.000Z');
  assert.equal(solicitudExpirada(publicadoEn, publicadoEn.getTime() + 59_999), false);
  assert.equal(solicitudExpirada(publicadoEn, publicadoEn.getTime() + 60_000), true);
  assert.equal(solicitudExpirada(null, publicadoEn.getTime() + 60_000), false);
});
