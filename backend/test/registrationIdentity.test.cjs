const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizarCedulaRegistro,
  normalizarTelefonoRegistro
} = require('../dist/utils/registrationIdentity');

test('normaliza teléfonos venezolanos para bloquear formatos equivalentes', () => {
  const canonico = normalizarTelefonoRegistro('0412-123-4567');

  assert.equal(canonico, '584121234567');
  assert.equal(normalizarTelefonoRegistro('+58 412 123 4567'), canonico);
  assert.equal(normalizarTelefonoRegistro('0058 412 123 4567'), canonico);
});

test('normaliza cédulas ignorando mayúsculas y separadores', () => {
  assert.equal(normalizarCedulaRegistro('v-28123456'), 'V28123456');
  assert.equal(normalizarCedulaRegistro('E 12345678'), 'E12345678');
});
